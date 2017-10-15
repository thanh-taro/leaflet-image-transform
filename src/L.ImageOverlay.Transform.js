L.ImageOverlay.Transform = {};

L.ImageOverlay.Transform.Marker = L.CircleMarker.extend({
  options: {
    name: null,
    radius: 5,
    fillColor: '#ffffff',
    color: '#202020',
    fillOpacity: 1,
    weight: 2,
    opacity: 1,
    cursor: 'all-scroll',
    className: 'leaflet-image-overlay-transform-marker'
  },

  onAdd: function (map) {
    L.CircleMarker.prototype.onAdd.call(this, map);

    var path = this._path;
    var options = this.options;

    if (path) {
      if (options.cursor) {
        path.style.cursor = options.cursor;
      }
      if (options.name) {
        L.DomUtil.addClass(path, 'leaflet-image-overlay-transform-marker--' + options.name);
      }
    }
  }
});

L.ImageOverlay.Transform = L.ImageOverlay.extend({
  options: {
    rotatable: true,
    scalable: true,
    draggable: true,

    keepRatio: false,

    // Makers
    markerClass: L.ImageOverlay.Transform.Marker,

    // Draw line
    lineGuideOptions: {
      weight: 1,
      opacity: 1,
      dashArray: [3, 3],
      fill: false
    }
  },

  initialize: function (image, latlngs, options) {
    this._polygon = null;
    this._handlers = null;
    this._handlersGroup = null;

    // Parse latLngs
    this._parseLatLngs(latlngs);

    // Assign URL or DOM image
    if (typeof image === 'string') {
      this._url = image;
    } else {
      this._rawImage = image;
    }

    this.setOptions(options);
  },

  onAdd: function (map) {
    var options = this.options;
    var element = this._image;

    // Init element
    if (!element) {
      this._initImage();
      element = this._image;
    }

    // Opacity
    if (options.opacity < 1) {
      this._updateOpacity();
    }

    // Interactive for dragging
    var rawImage = this._rawImage;
    L.DomUtil.addClass(rawImage, 'leaflet-interactive');
    this.addInteractiveTarget(rawImage);

    // Add to pane
    this.getPane().appendChild(element);

    // Reset when needed
    map.on('zoomend resetview', this._reset, this)
      .on('zoomend', this._onMapZoomEnd, this);

    this.on('mousedown', this._onDragStart, this);

    // Add to property
    this._map = map;

    // Reset element
    this._reset();

    // Reset markers and guideline
    this._resetMarkers();
  },

  onRemove: function (map) {
    // Clear events on map
    map.off('zoomend resetview', this._reset, this)
      .off('zoomend', this._onMapZoomEnd, this);

    // Clear events on image overlay
    this.off('mousedown', this._onDragStart, this);

    // Remove markers and guideline
    this._removeMarkers();

    // Call parent remove function
    L.ImageOverlay.prototype.onRemove.call(this, map);
  },

  setOptions: function (options) {
    options = L.extend({}, this.options, options);

    // Make sure this will be interactive
    this.options.interactive = true;

    // Set options
    L.setOptions(this, options);

    if (options.draggable) {
      this._draggable = true;
    }
    if (options.scalable) {
      this._scalable = true;
    }
    if (options.rotatable) {
      this._rotatable = true;
    }
    if (options.keepRatio) {
      this._keepRatio = true;
    }
  },

  getLatLngs: function () {
    return this._latlngs;
  },

  setLatLngs: function (latlngs) {
    this._parseLatLngs(latlngs);
    this._reset();
    this._resetMarkers();
  },

  setUrl: function (url) {
    this._url = url;
    if (this._rawImage) {
      this._rawImage.src = url;
    }
    return this;
  },

  _onMapZoomEnd: function () {
    this._resetMarkers();
  },

  _onDragStart: function (e) {
    var draggable = this._draggable;

    if (draggable) {
      var map = this._map;
      var latlngs = this._latlngs;
  
      this._dragging = true;
      this._startPoint = e.layerPoint;
      this._startLatLngs = latlngs;
  
      this.bringToFront();

      if (map.dragging.enabled()) {
        map.dragging.disable();
      }
  
      map
        .on('mousemove', this._onDrag, this)
        .on('mouseup', this._onDragEnd, this);
  
      this.fire('dragstart', {
        latlngs: latlngs
      });
    }
  },

  _onDrag: function (e) {
    if (this._dragging) {
      var map = this._map;
      var startLatLngs = this._startLatLngs;
      var startPoint = this._startPoint;
      var currentPoint = e.layerPoint;
      var dx = currentPoint.x - startPoint.x;
      var dy = currentPoint.y - startPoint.y;

      if (dx || dy) {
        var latlngs = this._moveLatLngs(dx, dy, startLatLngs);
        this.setLatLngs(latlngs);

        this.fire('drag', {
          latlngs: latlngs
        });
      }
    }
  },

  _onDragEnd: function () {
    if (this._dragging) {
      var map = this._map;
      var latlngs = this._latlngs;

      map.dragging.enable();

      delete this._dragging;
      delete this._startPoint;
      delete this._startLatLngs;

      this.fire('dragend', {
        latlngs: latlngs
      });
    }
  },

  _onScaleStart: function (e) {
    var scalable = this._scalable;
    
    if (scalable) {
      var map = this._map;
      var latlngs = this._latlngs;
  
      this._scaling = true;
      this._startPoint = e.layerPoint;
      this._startLatLngs = latlngs.slice(0);
      this._activeMarkerName = e.target.options.name;
      this._radian = this._getRadianFromLatLngs(latlngs);
  
      this.bringToFront();
  
      if (map.dragging.enabled()) {
        map.dragging.disable();
      }
  
      map
        .on('mousemove', this._onScale, this)
        .on('mouseup', this._onScaleEnd, this);
  
      this.fire('scalestart', {
        latlngs: latlngs
      });
    }
  },

  _onScale: function (e) {
    if (this._scaling) {
      var startPoint = this._startPoint;
      var currentPoint = e.layerPoint;
      var dx = currentPoint.x - startPoint.x;
      var dy = currentPoint.y - startPoint.y;

      if (dx || dy) {
        var map = this._map;
        var startLatLngs = this._startLatLngs;
        var radian = this._radian;
        var activeMarkerName = this._activeMarkerName;

        var latlngs = this._scaleLatLngs(dx, dy, activeMarkerName, startLatLngs);
        this.setLatLngs(latlngs);

        this.fire('scale', {
          latlngs: latlngs
        });
      }
    }
  },

  _onScaleEnd: function () {
    if (this._scaling) {
      var map = this._map;
      var latlngs = this._latlngs;

      map.dragging.enable();

      delete this._scaling;
      delete this._startPoint;
      delete this._startLatLngs;
      delete this._activeMarker;
      delete this._radian;

      this.fire('scaleend', {
        latlngs: latlngs
      });
    }
  },

  _reset: function () {
    var map = this._map;
    if (!map) {
      return;
    }

    var rawImage = this._rawImage;
    var element = this._image;
    var topLeftPoint = map.latLngToLayerPoint(this._topLeft);
    var topRightPoint = map.latLngToLayerPoint(this._topRight);
    var bottomLeftPoint = map.latLngToLayerPoint(this._bottomLeft);
    var bottomRightPoint = map.latLngToLayerPoint(this._bottomRight);

    var boundsPoint = L.bounds([topLeftPoint, topRightPoint, bottomLeftPoint, bottomRightPoint]);
    var size = boundsPoint.getSize();
    var topLeftPointInElement = topLeftPoint.subtract(boundsPoint.min);
    var vectorX = topRightPoint.subtract(topLeftPoint);
    var vectorY = bottomLeftPoint.subtract(topLeftPoint);
    var skewX = Math.atan2(vectorX.y, vectorX.x);
    var skewY = Math.atan2(vectorY.x, vectorY.y);

    // Set bounds
    this._bounds = L.latLngBounds(map.layerPointToLatLng(boundsPoint.min), map.layerPointToLatLng(boundsPoint.max));

    L.DomUtil.setPosition(element, boundsPoint.min);

    element.style.width = size.x + 'px';
    element.style.height = size.y + 'px';

    var imageWidth = rawImage.width;
    var imageHeight = rawImage.height;

    var scaleX = topLeftPoint.distanceTo(topRightPoint) / imageWidth * Math.cos(skewX);
    var scaleY = topLeftPoint.distanceTo(bottomLeftPoint) / imageHeight * Math.cos(skewY);

    rawImage.style.transformOrigin = '0px 0px 0px';
    rawImage.style.transform = 'translate(' + topLeftPointInElement.x + 'px, ' + topLeftPointInElement.y + 'px) ' + 'skew(' + skewY + 'rad, ' + skewX + 'rad) ' + 'scale(' + scaleX + ', ' + scaleY + ') ';
  },

  _initImage: function () {
    var url = this._url;
    var rawImage = this._rawImage;
    var options = this.options;

    // If passing URL, create new image DOM
    if (url) {
      rawImage = this._rawImage = L.DomUtil.create('img');
      rawImage.style.display = 'none';
      rawImage.src = url;
      if (options.crossOrigin) {
        rawImage.crossOrigin = '';
      }
    }

    // Image alt
    rawImage.alt = options.alt;

    // Add classes
    L.DomUtil.addClass(rawImage, 'leaflet-image-layer');

    // Create new div replace image DOM for position
    var element = this._image = L.DomUtil.create('div', 'leaflet-image-layer leaflet-zoom-animated leaflet-image-transform');
    element.appendChild(rawImage);
    element.onselectstart = L.Util.falseFn;
    element.onmousemove = L.Util.falseFn;
    rawImage.onload = function () {
      this._reset();
      rawImage.style.display = null;
      this.fire('load');
    }.bind(this);
  },

  _parseLatLngs: function (latlngs) {
    this._latlngs = latlngs;
    this._bottomLeft = L.latLng(latlngs[0]);
    this._topLeft = L.latLng(latlngs[1]);
    this._topRight = L.latLng(latlngs[2]);
    this._bottomRight = L.latLng(latlngs[3]);
  },

  _getCenterOfLatLngs: function (latlngs) {
    return this._getCenterOf2LatLngs(latlngs[1], latlngs[3]);
  },

  _getCenterOf2LatLngs: function (latlngA, latlngB) {
    var map = this._map;
    if (map) {
      var pointA = map.latLngToLayerPoint(latlngA);
      var pointB = map.latLngToLayerPoint(latlngB);
      return map.layerPointToLatLng(L.point((pointA.x + pointB.x) / 2, (pointA.y + pointB.y) / 2));
    }
    return L.latLng((latlngA.lat + latlngB.lat) / 2, (latlngA.lng + latlngB.lng) / 2);
  },

  _getRadianFromLatLngs: function (latlngs) {
    var map = this._map;
    if (!map) {
      return;
    }

    var bottomLeftPoint = map.latLngToLayerPoint(latlngs[0]);
    var topLeftPoint = map.latLngToLayerPoint(latlngs[1]);
    var topRightPoint = map.latLngToLayerPoint(latlngs[2]);
    var bottomRightPoint = map.latLngToLayerPoint(latlngs[3]);
    // top left minus bottom left
    var dx1 = topLeftPoint.x - bottomLeftPoint.x;
    var dy1 = topLeftPoint.y - bottomLeftPoint.y;
    // top right minus bottom right
    var dx2 = topRightPoint.x - bottomRightPoint.x;
    var dy2 = topRightPoint.y - bottomRightPoint.y;
    var radian = 0;
    if (dy1 < 0) {
      // -90 to 90 degree (-PI/2 to PI/2 radian)
      radian = -Math.atan(dx1 / dy1);
    } else {
      // 90 to -90 degree (PI/2 to -PI/2 radian)
      radian = Math.PI - Math.atan(dx2 / dy2);
    }
    return radian;
  },

  _scaleLatLngs: function (dx, dy, pointName, latlngs) {
    var map = this._map;
    if (!map) {
      return;
    }

    var centerPoint = map.latLngToLayerPoint(this._getCenterOfLatLngs(latlngs));
    var latlngsClone = latlngs.slice(0);
    var radian = this._getRadianFromLatLngs(latlngsClone);
    var latlngsCloneIndex;
    switch (pointName) {
      case 'bottomLeft':
        latlngsCloneIndex = 0;
        break;
      case 'bottom':
        latlngsCloneIndex = 0;
        dx = 0;
        break;
      case 'topLeft':
        latlngsCloneIndex = 1;
        break;
      case 'left':
        latlngsCloneIndex = 1;
        dy = 0;
        break;
      case 'topRight':
        latlngsCloneIndex = 2;
        break;
      case 'top':
        latlngsCloneIndex = 2;
        dx = 0;
        break;
      case 'bottomRight':
        latlngsCloneIndex = 3;
        break;
      case 'right':
        latlngsCloneIndex = 3;
        dy = 0;
        break;
    }

    var keepRatio = this._keepRatio;
    if (keepRatio) {
      // @TODO
    }

    var startPoint = map.latLngToLayerPoint(latlngsClone[latlngsCloneIndex]);
    var newLatLng = map.layerPointToLatLng(L.point(startPoint.x + dx, startPoint.y + dy));
    latlngsClone[latlngsCloneIndex] = newLatLng;
    if (radian !== 0) {
      // un-rotate
      latlngsClone = this._rotateLatLngs(-radian, latlngsClone, centerPoint);
    }
    switch (latlngsCloneIndex) {
      case 0:
        latlngsClone[1] = L.latLng(latlngsClone[2].lat, latlngsClone[0].lng);
        latlngsClone[3] = L.latLng(latlngsClone[0].lat, latlngsClone[2].lng);
        break;
      case 1:
        latlngsClone[0] = L.latLng(latlngsClone[3].lat, latlngsClone[1].lng);
        latlngsClone[2] = L.latLng(latlngsClone[1].lat, latlngsClone[3].lng);
        break;
      case 2:
        latlngsClone[1] = L.latLng(latlngsClone[2].lat, latlngsClone[0].lng);
        latlngsClone[3] = L.latLng(latlngsClone[0].lat, latlngsClone[2].lng);
        break;
      case 3:
        latlngsClone[0] = L.latLng(latlngsClone[3].lat, latlngsClone[1].lng);
        latlngsClone[2] = L.latLng(latlngsClone[1].lat, latlngsClone[3].lng);
        break;
    }
    if (radian !== 0) {
      // re-rotate
      latlngsClone = this._rotateLatLngs(radian, latlngsClone, centerPoint);
    }
    return latlngsClone;
  },

  _moveLatLngs: function (dx, dy, latlngs) {
    var map = this._map;
    var map = this._map;
    if (!map) {
      return;
    }

    var newLatLngs = [];
    for (var point, i = 0; i < 4; i++) {
      point = map.latLngToLayerPoint(latlngs[i]);
      point.x += dx;
      point.y += dy;
      newLatLngs.push(map.layerPointToLatLng(point));
    }
    return newLatLngs;
  },

  _rotateLatLngs: function (radian, latlngs, centerPoint) {
    var map = this._map;
    if (!map) {
      return;
    }

    var centerPoint = centerPoint || map.latLngToLayerPoint(this._getCenterOfLatLngs(latlngs));
    var sin = Math.sin(radian);
    var cos = Math.cos(radian);
    var newLatLngs = [];
    for (var point, i = latlngs.length - 1; i >= 0; i--) {
      point = map.latLngToLayerPoint(latlngs[i]);
      // move coordinate to center
      point.x -= centerPoint.x;
      point.y -= centerPoint.y;
      newLatLngs.push(map.layerPointToLatLng(L.point([
        centerPoint.x + point.x * cos - point.y * sin,
        centerPoint.y + point.x * sin + point.y * cos
      ])));
    }
    return newLatLngs;
  },

  _createMarkers: function () {
    var map = this._map;
    if (!map) {
      return;
    }
    var options = this.options;
    var markerClass = options.markerClass;
    var bottomLeft = this._bottomLeft;
    var topLeft = this._topLeft;
    var topRight = this._topRight;
    var bottomRight = this._bottomRight;
    var scalable = options.scalable;

    var handlers = this._handlers = {};
    var handlersGroup = this._handlersGroup = this._handlersGroup || new L.LayerGroup();

    // Draw line guide
    var polylineLatLngs = [bottomLeft, topLeft, topRight, bottomRight, bottomLeft];
    var guideLine = L.polyline(polylineLatLngs, options.lineGuideOptions);
    handlers.guideLine = guideLine;
    handlersGroup.addLayer(guideLine);

    if (scalable) {
      // Create bottom left marker
      var bottomLeftMarker = new markerClass(bottomLeft, {
        name: 'bottomLeft'
      });

      // Create top left marker
      var topLeftMarker = new markerClass(topLeft, {
        name: 'topLeft'
      });

      // Create top right marker
      var topRightMarker = new markerClass(topRight, {
        name: 'topRight'
      });

      // Create bottom right marker
      var bottomRightMarker = new markerClass(bottomRight, {
        name: 'bottomRight'
      });

      // Create left marker
      var leftMarkerLatLng = this._getCenterOf2LatLngs(bottomLeft, topLeft);
      var leftMarker = new markerClass(leftMarkerLatLng, {
        name: 'left'
      });

      // Create top marker
      var topMarkerLatLng = this._getCenterOf2LatLngs(topLeft, topRight);
      var topMarker = new markerClass(topMarkerLatLng, {
        name: 'top'
      });

      // Create right marker
      var rightMarkerLatLng = this._getCenterOf2LatLngs(topRight, bottomRight);
      var rightMarker = new markerClass(rightMarkerLatLng, {
        name: 'right'
      });

      // Create bottom marker
      var bottomMarkerLatLng = this._getCenterOf2LatLngs(bottomRight, bottomLeft);
      var bottomMarker = new markerClass(bottomMarkerLatLng, {
        name: 'bottom'
      });

      // Add event listeners
      bottomLeftMarker.on('mousedown', this._onScaleStart, this);
      topLeftMarker.on('mousedown', this._onScaleStart, this);
      topRightMarker.on('mousedown', this._onScaleStart, this);
      bottomRightMarker.on('mousedown', this._onScaleStart, this);
      leftMarker.on('mousedown', this._onScaleStart, this);
      topMarker.on('mousedown', this._onScaleStart, this);
      rightMarker.on('mousedown', this._onScaleStart, this);
      bottomMarker.on('mousedown', this._onScaleStart, this);

      // Add to handlers
      handlers.bottomLeft = bottomLeftMarker;
      handlers.topLeft = topLeftMarker;
      handlers.topRight = topRightMarker;
      handlers.bottomRight = bottomRightMarker;
      handlers.left = leftMarker;
      handlers.top = topMarker;
      handlers.right = rightMarker;
      handlers.bottom = bottomMarker;

      // Add to group
      handlersGroup.addLayer(bottomLeftMarker);
      handlersGroup.addLayer(topLeftMarker);
      handlersGroup.addLayer(topRightMarker);
      handlersGroup.addLayer(bottomRightMarker);
      handlersGroup.addLayer(leftMarker);
      handlersGroup.addLayer(topMarker);
      handlersGroup.addLayer(rightMarker);
      handlersGroup.addLayer(bottomMarker);
    }

    // Add to map
    handlersGroup.addTo(map);
  },

  _removeMarkers: function () {
    var map = this._map;
    if (!map) {
      return;
    }

    var handlersGroup = this._handlersGroup;
    if (handlersGroup) {
      map.removeLayer(handlersGroup);
      handlersGroup = this._handlersGroup = null;
    }
  },

  _resetMarkers: function () {
    this._removeMarkers();
    this._createMarkers();
  },

  _hideMarkers: function () {}
});

/**
 * Factory
 */
L.imageOverlay.transform = function (image, latlngs, options) {
  return new L.ImageOverlay.Transform(image, latlngs, options);
};