var $ = jQuery = require('jquery')

var utils = require('utils')
var Graph = require('graph')

module.exports = Application

var Application = function() {
  var app = this

  this.map = L.map('map').setView([33.754084, -84.389705], 16)
  this.map.doubleClickZoom.disable()

  L.tileLayer('http://{s}.tiles.mapbox.com/v3/conveyal.ie3o67m0/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
    maxZoom: 20
  }).addTo(this.map)

  this.routeLayer = L.layerGroup().addTo(this.map)
  this.extensionLayer = L.layerGroup().addTo(this.map)

  this.map.on('dragend', this.refreshEdges.bind(this))
  this.map.on('zoomend', this.refreshEdges.bind(this))

  this.map.on('mousemove', function(e) {
    if(app.graph) {
      var vertex = app.graph.nearestVertex(e.latlng.lat, e.latlng.lng)
      if(app.activeVertex === vertex) return
      app.activeVertex = vertex
      app.extensionLayer.clearLayers()
      new L.circle([vertex.lat, vertex.lng], 10).addTo(app.extensionLayer)
      if(app.lastStopVertex && app.activeVertex !== app.lastStopVertex) {
        var edges = app.graph.dijkstraPath(app.activeVertex)
        if(edges) {
          app.extEdges = edges
          new L.polyline(app.constructEdgeSequenceLatlngs(edges)).addTo(app.extensionLayer)
        }
      }
    }
  })

  this.map.on('click', function(e) {
    if(app.activeVertex && app.activeVertex !== app.lastStopVertex) app.extendRoute()
  })

  this.map.on('dblclick', function(e) {
    app.activeVertex = app.lastStopVertex = null
  })

  this.refreshEdges()
}

Application.prototype.refreshEdges = function() {
  var app = this;
  var bounds = this.map.getBounds()
  $.ajax({
    url: '/api/osm/getEdges',
    data: {
      west: bounds.getWest(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      north: bounds.getNorth()
    },
    success: function(data) {
      app.buildGraph(data.edges)
    },
    type: 'GET'
  })
}

Application.prototype.buildGraph = function(edgeData) {
  var app = this;
  this.graph = new Graph()
  edgeData.forEach(function(edge) {
    var latlngs = utils.decodePolyline(edge.geometry.points);
    app.graph.addEdge(edge.id, latlngs)
  });

  this.activeVertex = null;
  if(this.lastStopVertex) {
    this.lastStopVertex = this.graph.vertices[this.lastStopVertex.id]
    this.graph.dijkstra(this.lastStopVertex)
  }
}

// Build a latlng array from a sequence of OsmEdges, reversing edges as needed

Application.prototype.constructEdgeSequenceLatlngs = function(edges) {
  var latlngs = [];

  // handle first edge
  if(edges[0].from === this.lastStopVertex) {
    latlngs = latlngs.concat(edges[0].latlngs)
  }
  else {
    latlngs = latlngs.concat(edges[0].latlngs.slice().reverse())
  }
  lastToVertex = edges[0].opposite(this.lastStopVertex)

  // handle any remaining edges
  for(var i=1; i<edges.length; i++) {
    if(edges[i].from === lastToVertex) {
      latlngs = latlngs.concat(edges[i].latlngs)
    }
    else {
      latlngs = latlngs.concat(edges[i].latlngs.slice().reverse())
    }
    lastToVertex = edges[i].opposite(lastToVertex)
  }

  return latlngs;
}

Application.prototype.extendRoute = function() {
  var app = this;

  new L.circle([app.activeVertex.lat, app.activeVertex.lng], 10).addTo(app.routeLayer)

  if(app.extEdges) {
    new L.polyline(app.constructEdgeSequenceLatlngs(app.extEdges)).addTo(app.routeLayer)
  }

  app.lastStopVertex = app.activeVertex
  app.graph.dijkstra(app.activeVertex)
}

$(document).ready(function() {
  new Application();
});
