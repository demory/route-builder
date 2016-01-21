var haversine = require('haversine')
var BinaryHeap = require('binaryheap')

// A simple graph representing the currently visible OSM edges

var Graph = function() {
  this.edges = {};
  this.vertices = {};
}

Graph.prototype.addEdge = function(id, latlngs) {
  var from = this.vertex(latlngs[0].lat, latlngs[0].lng)
  var to = this.vertex(latlngs[latlngs.length-1].lat, latlngs[latlngs.length-1].lng)
  this.edges[id] = new GraphEdge(from, to, latlngs)
}

// Find or create a vertex given a lat/lng

Graph.prototype.vertex = function(lat, lng) {
  var id = lat + ',' + lng
  if(id in this.vertices) return this.vertices[id]
  var vertex = new GraphVertex(lat, lng)
  this.vertices[id] = vertex
  return vertex
}

// Find the closest vertex in the graph to a lat/lng coordinate

Graph.prototype.nearestVertex = function(lat, lng) {
  var bestDist = Number.POSITIVE_INFINITY
  var bestVertex
  // TODO: use a spatial index here
  for(var id in this.vertices) {
    var vertex = this.vertices[id]
    var dist = haversine(lat, lng, vertex.lat, vertex.lng)
    if(dist < bestDist) {
      bestDist = dist;
      bestVertex = vertex
    }
  }
  return bestVertex
}

// Build a shortest path tree for the currently visible graph and active vertex (source)

Graph.prototype.dijkstra = function(source) {
  var graph = this

  graph.prev = {}
  graph.prevEdges = {}
  var dist = {}

  dist[source.id] = 0
  var Q = new BinaryHeap(
    function(element) { return element.dist },
    function(element) { return element.id },
    'dist'
  )

  for(var id in this.vertices) {
    var v = this.vertices[id]
    if (v !== source) {
      dist[id] = Number.POSITIVE_INFINITY
    }
    Q.push({ dist: dist[id], id: id })
  }

  while(Q.size() > 0) {
    var u = graph.vertices[Q.pop().id]
    u.incidentEdges.forEach(function(edge) {
      var v = edge.opposite(u)
      var alt = dist[u.id] + edge.length
      if(alt < dist[v.id]) {
        dist[v.id] = alt
        graph.prev[v.id] = u
        graph.prevEdges[v.id] = edge
        Q.decreaseKey(v.id, alt)
      }
    })
  }
}

// retrieve the shortest path for a target vertex

Graph.prototype.dijkstraPath = function(target) {

  if(!this.prevEdges[target.id]) return null; // unreachable target node

  var edges = [this.prevEdges[target.id]]
  var u = target
  while(this.prev[u.id]) {
    u = this.prev[u.id]
    if(this.prevEdges[u.id]) edges.unshift(this.prevEdges[u.id])
  }
  return edges
}


// Create a graph vertex given a lat/lng

var GraphVertex = function(lat, lng) {
  this.id = lat + ',' + lng
  this.lat = lat
  this.lng = lng
  this.incidentEdges = []
}


// Create a graph edge given from/to vertixes and the lat/lng geometry

var GraphEdge = function(from, to, latlngs) {
  this.from = from
  this.to = to
  this.latlngs = latlngs
  from.incidentEdges.push(this)
  to.incidentEdges.push(this)

  // compute the edge length from the lat/lng array
  this.length = 0
  for(var i=0; i < latlngs.length-1; i++) {
    this.length += haversine(latlngs[i].lat, latlngs[i].lng, latlngs[i+1].lat, latlngs[i+1].lng)
  }
}

// return the opposite vertex for this edge

GraphEdge.prototype.opposite = function(v) {
  if(v === this.from) return this.to
  if(v === this.to) return this.from
}


module.exports = Graph