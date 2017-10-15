L.Handler.ImageOverlayTransform = L.Handler.extend({
  options: {
    rotatable: true,
    scalable: true,
    draggable: true,

    topLeftHandler: {
      name: 'topLeftHandler',
      className: 'leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--topleft'
    },
    topRightHandler: {
      name: 'topRightHandler',
      className: 'leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--topright'
    },
    bottomLeftHandler: {
      name: 'bottomLeftHandler',
      className: 'leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--bottomleft'
    },
    bottomRightHandler: {
      name: 'bottomRightHandler',
      className: 'leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--bottomright'
    },
    rotationHandler: {
      name: 'rotationHandler',
      className: 'leaflet-image-overlay-transform-handler transform-handler--rotate',
      cursor: 'pointer'
    },

    line: {
      weight: 1,
      opacity: 1,
      dashArray: [3, 3],
      fill: false
    }
  },

  initialize: function (layer) {
    this._layer = layer;
    this._polygon = null;
    this._handlers = [];
    this._bounds = [
      // bottom left - sw
      // top left - nw
      // top right- ne
      // bottom right - se
    ];
  },

  addHooks: function () {
    var layer = this._layer;
    var map = this._layer._map;
    layer
      .on('mousedown', this._onDragStart, this);
    map
      .on('zoomend', this._onMapZoomEnd, this);
    this._updateHandlers();
  },

  removeHooks: function () {
    var layer = this._layer;
    var map = this._layer._map;
    map
      .off('zoomend', this._onMapZoomEnd, this);
    layer
      .off('mousedown', this._onDragStart, this);
    this._removeHandlers();
  },

  /**
   * Enable transform feature
   */
  enable: function (options) {
    var layer = this._layer;

    if (options) {
      this.setOptions(options);
    }
    if (!this.options.bounds || this.options.bounds.length !== 4) {
      var layerBounds = layer._bounds;
      var bounds = [
        layerBounds.getSouthWest(),
        layerBounds.getNorthWest(),
        layerBounds.getNorthEast(),
        layerBounds.getSouthEast(),
      ];
    } else {
      var bounds = this.options.bounds;
    }
    this.setBounds(bounds);
    return L.Handler.prototype.enable.call(this);
  },

  /**
   * Set options for transform
   */
  setOptions: function (options) {
    var enabled = this._enabled;
    if (enabled) {
      this.disable();
    }
    this.options = L.extend({}, L.Handler.ImageOverlayTransform.prototype.options, options);
    if (enabled) {
      this.enable();
    }
    return this;
  },

  /**
   * Set bounds
   */
  setBounds: function (bounds) {
    var layer = this._layer;
    this._bounds = bounds;

    layer.setBounds(bounds);

    this._updateHandlers();
  },

  /**
   * Hide handlers
   */
  hideHandlers: function () {
    var map = this._layer._map;
    var handlersGroup = this._handlersGroup;
    map.removeLayer(handlersGroup);
  },

  /**
   * Show handlers
   */
  showHandlers: function () {
    var map = this._layer._map;
    var handlersGroup = this._handlersGroup;
    handlersGroup.addTo(map);
  },

  /**
   * Get rotation radian
   */
  getRadian: function () {
    return this._getRadianFromBounds();
  },

  /**
   * Get center LatLng
   */
  getCenter: function () {
    return this._getCenterBounds();
  },

  /**
   * Rotate
   */
  rotate: function (radian) {
    while (radian > 2 * Math.PI) {
      radian /= 2 * Math.PI;
    }
    var layer = this._layer;
    var bounds = this._rotateBounds(radian);
    this._bounds = bounds;

    layer.setBounds(bounds);

    this._updateHandlers();
  },

  /**
   * Move center to new LatLng
   */
  moveTo: function (newCenter) {
    var map = this._layer._map;
    var layer = this._layer;
    var centerPoint = this._getCenterBounds();
    var newCenterPoint = map.latLngToLayerPoint(newCenter);
    this._centerPoint = newCenterPoint;
    var dx = newCenterPoint.x - centerPoint.x;
    var dy = newCenterPoint.y - centerPoint.y;
    if (dx || dy) {
      var bounds = this._moveBounds(dx, dy);
      this._bounds = bounds;

      layer.setBounds(bounds);

      this._updateHandlers();
    }
  },

  _onMapZoomEnd: function () {
    var map = this._layer._map;
    var layer = this._layer;
    this._updateHandlers();
  },

  _onDragStart: function (e) {
    var map = this._layer._map;
    var layer = this._layer;
    var bounds = this._bounds;

    this._dragging = true;
    this._startPoint = e.layerPoint;
    this._startBounds = this._bounds;

    layer.bringToFront();

    if (map.dragging.enabled()) {
      map.dragging.disable();
    }

    map
      .on('mousemove', this._onDrag, this)
      .on('mouseup', this._onDragEnd, this);

    layer.fire('dragstart', { bounds: bounds });
  },

  _onDrag: function (e) {
    if (this._dragging) {
      var map = this._layer._map;
      var layer = this._layer;
      var startBounds = this._startBounds;
      var startPoint = this._startPoint;
      var currentPoint = e.layerPoint;
      var dx = currentPoint.x - startPoint.x;
      var dy = currentPoint.y - startPoint.y;

      if (dx || dy) {
        var bounds = this._moveBounds(dx, dy, startBounds);
        this._bounds = bounds;

        layer.setBounds(bounds);

        this._updateHandlers();

        this._layer.fire('drag', { bounds: bounds });
      }
    }
  },

  _onDragEnd: function () {
    if (this._dragging) {
      var map = this._layer._map;
      var layer = this._layer;
      var bounds = this._bounds;

      map.dragging.enable();

      delete this._dragging;
      delete this._startPoint;
      delete this._startBounds;

      layer.fire('dragend', { bounds: bounds });
    }
  },

  _onScaleStart: function (e) {
    var map = this._layer._map;
    var layer = this._layer;
    var bounds = this._bounds;

    this._scaling = true;
    this._startPoint = e.layerPoint;
    this._startBounds = bounds.slice(0);
    this._activeMarker = e.target;
    this._radian = this.getRadian();

    layer.bringToFront();

    if (map.dragging.enabled()) {
      map.dragging.disable();
    }

    map
      .on('mousemove', this._onScale, this)
      .on('mouseup', this._onScaleEnd, this);

    layer.fire('scalestart', { bounds: bounds });
  },

  _onScale: function (e) {
    if (this._scaling) {
      var startPoint = this._startPoint;
      var currentPoint = e.layerPoint;
      var dx = currentPoint.x - startPoint.x;
      var dy = currentPoint.y - startPoint.y;

      if (dx || dy) {
        var map = this._layer._map;
        var layer = this._layer;
        var startBounds = this._startBounds;
        var radian = this._radian;
        var activeMarker = this._activeMarker;

        var bounds = this._scaleBounds(dx, dy, activeMarker.options.name.replace('Handler', ''), startBounds);
        this._bounds = bounds;

        layer.setBounds(bounds);

        this._updateHandlers();

        layer.fire('scale', { bounds: bounds });
      }
    }
  },

  _onScaleEnd: function () {
    if (this._scaling) {
      var map = this._layer._map;
      var layer = this._layer;
      var bounds = this._bounds;

      map.dragging.enable();

      delete this._scaling;
      delete this._startPoint;
      delete this._startBounds;
      delete this._activeMarker;
      delete this._radian;

      layer.fire('scaleend', { bounds: bounds });
    }
  },

  _onRotateStart: function (e) {
    var map = this._layer._map;
    var layer = this._layer;
    var bounds = this._bounds;

    this._rotating = true;
    this._startPoint = e.layerPoint;
    this._startBounds = bounds;

    layer.bringToFront();

    if (map.dragging.enabled()) {
      map.dragging.disable();
    }

    map
      .on('mousemove', this._onRotate, this)
      .on('mouseup', this._onRotateEnd, this);

    layer.fire('rotatestart', { bounds: bounds });
  },

  _onRotate: function (e) {
    if (this._rotating) {
      var map = this._layer._map;
      var layer = this._layer;
      var startPoint = this._startPoint;
      var startBounds = this._startBounds;
      var currentPoint = e.layerPoint;
      var centerPoint = this._getCenterBounds(startBounds);

      // move to center and calculate radian
      var radian = Math.atan2(currentPoint.y - centerPoint.y, currentPoint.x - centerPoint.x) - Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
      while (radian > 2 * Math.PI) {
        radian /= 2 * Math.PI;
      }

      var bounds = this._rotateBounds(radian, startBounds);
      this._bounds = bounds;

      layer.setBounds(bounds);

      this._updateHandlers();

      layer.fire('rotate', { bounds: bounds });
    }
  },

  _onRotateEnd: function () {
    if (this._rotating) {
      var map = this._layer._map;
      var layer = this._layer;
      var bounds = this._bounds;

      map.dragging.enable();

      delete this._rotating;
      delete this._startPoint;
      delete this._startBounds;

      layer.fire('rotateend', { bounds: bounds });
    }
  },

  _rotateBounds: function (radian, startBounds, centerPoint) {
    startBounds = startBounds || this._bounds;
    var map = this._layer._map;
    var centerPoint = centerPoint || this._getCenterBounds(startBounds);
    var bounds = [];
    var sin = Math.sin(radian);
    var cos = Math.cos(radian);
    for (var point, i = 0; i < 4; i++) {
      point = map.latLngToLayerPoint(startBounds[i]);
      // move coordinate to center
      point.x -= centerPoint.x;
      point.y -= centerPoint.y;
      bounds.push(map.layerPointToLatLng(L.point([
        centerPoint.x + point.x * cos - point.y * sin,
        centerPoint.y + point.x * sin + point.y * cos
      ])));
    }
    return bounds;
  },

  _moveBounds: function(dx, dy, startBounds) {
    startBounds = startBounds || this._bounds;
    var map = this._layer._map;
    var bounds = [];
    for (var point, i = 0; i < 4; i++) {
      point = map.latLngToLayerPoint(startBounds[i]);
      point.x += dx;
      point.y += dy;
      bounds.push(map.layerPointToLatLng(point));
    }
    return bounds;
  },

  _scaleBounds: function (dx, dy, pointName, startBounds) {
    startBounds = startBounds || this._bounds;
    var map = this._layer._map;
    var centerPoint = this._getCenterBounds(startBounds);
    var bounds = startBounds.slice(0);
    var radian = this._getRadianFromBounds(bounds);
    var boundsIndex;
    switch (pointName) {
      case 'bottomLeft':
        boundsIndex = 0;
        break;
      case 'bottom':
        boundsIndex = 0;
        dx = 0;
        break;
      case 'topLeft':
        boundsIndex = 1;
        break;
      case 'left':
        boundsIndex = 1;
        dy = 0;
        break;
      case 'topRight':
        boundsIndex = 2;
        break;
      case 'top':
        boundsIndex = 2;
        dx = 0;
        break;
      case 'bottomRight':
        boundsIndex = 3;
        break;
      case 'right':
        boundsIndex = 3;
        dy = 0;
        break;
    }
    var startPoint = map.latLngToLayerPoint(startBounds[boundsIndex]);
    var newLatLng = map.layerPointToLatLng(L.point(startPoint.x + dx, startPoint.y + dy));
    bounds[boundsIndex] = newLatLng;
    // un-rotate
    bounds = this._rotateBounds(- radian, bounds, centerPoint);
    switch (boundsIndex) {
      case 0:
        bounds[1] = L.latLng(bounds[2].lat, bounds[0].lng);
        bounds[3] = L.latLng(bounds[0].lat, bounds[2].lng);
        break;
      case 1:
        bounds[0] = L.latLng(bounds[3].lat, bounds[1].lng);
        bounds[2] = L.latLng(bounds[1].lat, bounds[3].lng);
        break;
      case 2:
        bounds[1] = L.latLng(bounds[2].lat, bounds[0].lng);
        bounds[3] = L.latLng(bounds[0].lat, bounds[2].lng);
        break;
      case 3:
        bounds[0] = L.latLng(bounds[3].lat, bounds[1].lng);
        bounds[2] = L.latLng(bounds[1].lat, bounds[3].lng);
        break;
    }
    // re-rotate
    bounds = this._rotateBounds(radian, bounds, centerPoint);
    return bounds;
  },

  _getRadianFromBounds: function (bounds) {
    bounds = bounds || this._bounds;
    var map = this._layer._map;
    var bottomLeftPoint = map.latLngToLayerPoint(bounds[0]);
    var topLeftPoint = map.latLngToLayerPoint(bounds[1]);
    var topRightPoint = map.latLngToLayerPoint(bounds[2]);
    var bottomRightPoint = map.latLngToLayerPoint(bounds[3]);
    // top left minus bottom left
    var dx1 = topLeftPoint.x - bottomLeftPoint.x;
    var dy1 = topLeftPoint.y - bottomLeftPoint.y;
    // top right minus bottom right
    var dx2 = topRightPoint.x - bottomRightPoint.x;
    var dy2 = topRightPoint.y - bottomRightPoint.y;
    var radian = 0;
    if (dy1 < 0) {
      // -90 to 90 degree (-PI/2 to PI/2 radian)
      radian = - Math.atan(dx1 / dy1);
    } else {
      // 90 to -90 degree (PI/2 to -PI/2 radian)
      radian = Math.PI - Math.atan(dx2 / dy2);
    }
    return radian;
  },

  _getCenterBounds: function (bounds) {
    bounds = bounds || this._bounds;
    var map = this._layer._map;
    var topLeftPoint = map.latLngToLayerPoint(bounds[1]);
    var bottomRightPoint = map.latLngToLayerPoint(bounds[3]);
    return L.point((topLeftPoint.x + bottomRightPoint.x) / 2, (topLeftPoint.y + bottomRightPoint.y) / 2);
  },

  _createHandlers: function () {
    var map = this._layer._map;
    var bounds = this._bounds;
    if (map) {
      // group handlers
      this._handlers = {};
      this._handlersGroup = this._handlersGroup || (new L.LayerGroup()).addTo(map);

      // draw polygon by 4 points in bounds
      this._polygon = (new L.Polygon(this._bounds, L.extend({ pane: this._layer.options.pane }, this.options.line))).addTo(this._handlersGroup);

      // handlers for scaling
      if (this.options.scalable) {
        var edges = ['bottomLeftHandler', 'topLeftHandler', 'topRightHandler', 'bottomRightHandler'];
        var edgeOptionsArr = [this.options.bottomLeftHandler, this.options.topLeftHandler, this.options.topRightHandler, this.options.bottomRightHandler];
        for (var i = 0; i < 4; i++) {
          this._handlers[edges[i]] = (new L.ImageOverlayTransform.Handle(bounds[i], L.extend({ name: edges[i], pane: this._layer.options.pane }, edgeOptionsArr[i])))
            .on('mousedown', this._onScaleStart, this)
            .addTo(this._handlersGroup);
        }
      }

      // rotation handler
      if (this.options.rotatable) {
        var bottomPoint = new L.LatLng((bounds[0].lat + bounds[3].lat) / 2, (bounds[0].lng + bounds[3].lng) / 2);
        var topPoint = new L.LatLng((bounds[1].lat + bounds[2].lat) / 2, (bounds[1].lng + bounds[2].lng) / 2);
        var handlerPosition = map.layerPointToLatLng(L.ImageOverlayTransform.pointOnLine(map.latLngToLayerPoint(bottomPoint), map.latLngToLayerPoint(topPoint), 20));
        // draw line
        this._rotationLine = (new L.Polyline([topPoint, handlerPosition], L.extend({ pane: this._layer.options.pane }, this.options.line))).addTo(this._handlersGroup);
        this._handlers.rotation = (new L.ImageOverlayTransform.Handle(handlerPosition, L.extend({ pane: this._layer.options.pane }, this.options.rotationHandler)))
          .on('mousedown', this._onRotateStart, this)
          .addTo(this._handlersGroup);
      }
    }
  },

  _removeHandlers: function () {
    if (this._handlersGroup) {
      if (this._polygon) {
        this._handlersGroup.removeLayer(this._polygon);
        this._polygon = null;
      }
      if (this._rotationLine) {
        this._handlersGroup.removeLayer(this._rotationLine);
        this._rotationLine = null;
      }
      if (this._handlers) {
        for (handlerName in this._handlers) {
          this._handlersGroup.removeLayer(this._handlers[handlerName]);
          this._handlers[handlerName] = null;
          delete this._handlers[handlerName];
        }
      }
    }
  },

  _updateHandlers: function () {
    this._removeHandlers();
    this._createHandlers();
  }
});