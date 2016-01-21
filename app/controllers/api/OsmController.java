package controllers.api;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.vividsolutions.jts.geom.Coordinate;
import com.vividsolutions.jts.geom.Envelope;
import com.vividsolutions.jts.index.quadtree.Quadtree;
import crosby.binary.BinaryParser;
import crosby.binary.Osmformat;
import crosby.binary.file.BlockInputStream;
import crosby.binary.file.BlockReaderAdapter;
import org.opentripplanner.util.PolylineEncoder;
import org.opentripplanner.util.model.EncodedPolylineBean;
import play.Play;
import play.libs.Json;
import play.mvc.Controller;
import play.mvc.Result;

import java.io.FileInputStream;
import java.io.InputStream;
import java.util.*;

public class OsmController extends Controller {

    static Quadtree edgeTree = new Quadtree();

    // Initialization

    static {
        OsmLoader osmLoader = new OsmLoader(Play.application().configuration().getString("application.osm"));

        System.out.println("read nodes: " + osmLoader.osmNodes.size());
        System.out.println("read ways: " + osmLoader.osmWays.size());
        System.out.println("split edges: " + osmLoader.osmEdges.size());

        // build the quadtree
        for(OsmEdge edge : osmLoader.osmEdges.values()) {
            edgeTree.insert(edge.getEnvelope(), edge);
        }
    }

    // Get the edges within a bounding box

    public static Result getEdges(Double west, Double east, Double south, Double north) {
        Envelope queryEnvelope = new Envelope(west, east, south, north);
        List results = edgeTree.query(queryEnvelope);

        EdgesResponse resp = new EdgesResponse();
        for(Object obj : results) {
            OsmEdge edge = (OsmEdge) obj;
            // ensure this is actually a match:
            if(edge.getEnvelope().intersects(queryEnvelope)) resp.edges.add(edge);
        }

        return ok(Json.toJson(resp));
    }
}

class OsmLoader {

    Map<Long, OsmNode> osmNodes = new HashMap<>();
    Map<Long, OsmWay> osmWays = new HashMap<>();
    Map<String, OsmEdge> osmEdges = new HashMap<>();

    public OsmLoader(String filename) {
        try {
            InputStream input = new FileInputStream(filename);
            BlockReaderAdapter osmParser = new OsmBinaryParser();
            new BlockInputStream(input, osmParser).process();
        } catch (Exception e) {
            e.printStackTrace();
        }

        splitWays();
    }

    // split the ways into edges by intersection

    private void splitWays() {
        for (OsmWay way : osmWays.values()) {
            for (OsmNode node : way.nodes) {
                node.used++;
            }
        }

        for (OsmWay way : osmWays.values()) {

            int lastIsect = 0;
            int edgeIndex = 0;
            for(int i=0; i<way.nodes.size(); i++) {
                if(way.nodes.get(i).used > 1) { // this is an intersection of 2 or more ways
                    if(i == lastIsect) continue;
                    OsmEdge edge = new OsmEdge(way.id + ":" + edgeIndex++, way.nodes.subList(lastIsect, i+1));
                    edge.name = way.name;
                    osmEdges.put(edge.id, edge);
                    lastIsect = i;
                }
            }
            // add the final edge, if applicable
            if(lastIsect < way.nodes.size()-1) {
                OsmEdge edge = new OsmEdge(way.id + ":" + edgeIndex, way.nodes.subList(lastIsect, way.nodes.size()));
                edge.name = way.name;
                osmEdges.put(edge.id, edge);
            }
        }
    }

    // Read OSM from a PBF

    private class OsmBinaryParser extends BinaryParser {
        @Override
        protected void parseDense(Osmformat.DenseNodes nodes) {
            long lastId = 0, lastLat = 0, lastLon = 0;

            for (int i = 0; i < nodes.getIdCount(); i++) {
                lastId += nodes.getId(i);
                lastLat += nodes.getLat(i);
                lastLon += nodes.getLon(i);
                osmNodes.put(lastId, new OsmNode(lastId, parseLat(lastLat), parseLon(lastLon)));
            }
        }

        @Override
        protected void parseNodes(List<Osmformat.Node> nodes) {
            for (Osmformat.Node n : nodes) {
                osmNodes.put(n.getId(), new OsmNode(n.getId(), parseLat(n.getLat()), parseLon(n.getLon())));
            }
        }

        @Override
        protected void parseWays(List<Osmformat.Way> ways) {

            for (Osmformat.Way w : ways) {
                Set<String> keys = new HashSet<>();
                String name = "unknown";
                for (int i = 0; i < w.getKeysCount(); i++) {
                    String key = getStringById(w.getKeys(i));
                    keys.add(key);
                    if(key.equals("name")) name = getStringById(w.getVals(i));
                }

                if (!keys.contains("highway")) continue; // only consider highway nodes for now
                // #TODO: also include rail infrastructure

                OsmWay way = new OsmWay(w.getId());
                way.name = name;

                long lastRef = 0;
                for (Long ref : w.getRefsList()) {
                    lastRef += ref;
                    way.nodes.add(osmNodes.get(lastRef));
                }

                osmWays.put(way.id, way);
            }
        }

        @Override
        protected void parseRelations(List<Osmformat.Relation> rels) {
        }

        @Override
        protected void parse(Osmformat.HeaderBlock header) {
        }

        @Override
        public void complete() {
        }
    }
}

class OsmNode {
    long id;
    double lat, lng;
    int used = 0; // how many times highway ways use this node; used to find intersections

    public OsmNode(long id, double lat, double lng) {
        this.id = id;
        this.lat = lat;
        this.lng = lng;
    }
}

class OsmWay {
    long id;
    List<OsmNode> nodes = new ArrayList<>();
    String name;

    public OsmWay(long id) {
        this.id = id;
    }
}

// A segment of an OSM way. This class is serialized in the getEdges API response

class OsmEdge {

    public String id;

    public String name;

    @JsonIgnore
    public List<OsmNode> nodes = new ArrayList<>();

    public OsmEdge(String id, List<OsmNode> nodes) {
        this.id = id;
        this.nodes = nodes;
    }

    @JsonIgnore
    public Envelope getEnvelope() {
        Envelope env = new Envelope();
        for(OsmNode node : nodes) env.expandToInclude(node.lng, node.lat);
        return env;
    }

    public EncodedPolylineBean getGeometry() {
        List<Coordinate> coords = new ArrayList<>();
        for(OsmNode node : nodes) coords.add(new Coordinate(node.lng, node.lat));
        return PolylineEncoder.createEncodings(coords);
    }
}

class EdgesResponse {
    public List<OsmEdge> edges = new ArrayList<>();
}