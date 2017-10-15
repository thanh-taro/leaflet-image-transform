L.ImageOverlay.Rotated = L.ImageOverlay.extend({
    initialize: function(image, topleft, topright, bottomleft, options) {
        if (typeof image === "string") {
            this._url = image;
        } else {
            this._rawImage = image;
        }
        this._topLeft = L.latLng(topleft);
        this._topRight = L.latLng(topright);
        this._bottomLeft = L.latLng(bottomleft);
        L.setOptions(this, options);
    },
    onAdd: function(map) {
        if (!this._image) {
            this._initImage();
            if (this.options.opacity < 1) {
                this._updateOpacity();
            }
        }
        if (this.options.interactive) {
            L.DomUtil.addClass(this._rawImage, "leaflet-interactive");
            this.addInteractiveTarget(this._rawImage);
        }
        map.on("zoomend resetview", this._reset, this);
        this.getPane().appendChild(this._image);
        this._reset();
    },
    onRemove: function(map) {
        map.off("zoomend resetview", this._reset, this);
        L.ImageOverlay.prototype.onRemove.call(this, map);
    },
    _initImage: function() {
        var img = this._rawImage;
        if (this._url) {
            img = L.DomUtil.create("img");
            img.style.display = "none";
            if (this.options.crossOrigin) {
                img.crossOrigin = "";
            }
            img.src = this._url;
            this._rawImage = img;
        }
        L.DomUtil.addClass(img, "leaflet-image-layer");
        var div = this._image = L.DomUtil.create("div", "leaflet-image-layer " + (this._zoomAnimated ? "leaflet-zoom-animated" : ""));
        div.appendChild(img);
        div.onselectstart = L.Util.falseFn;
        div.onmousemove = L.Util.falseFn;
        img.onload = function() {
            this._reset();
            img.style.display = "block";
            this.fire("load");
        }.bind(this);
        img.alt = this.options.alt;
    },
    _reset: function() {
        var div = this._image;
        var pxTopLeft = this._map.latLngToLayerPoint(this._topLeft);
        var pxTopRight = this._map.latLngToLayerPoint(this._topRight);
        var pxBottomLeft = this._map.latLngToLayerPoint(this._bottomLeft);
        var pxBottomRight = pxTopRight.subtract(pxTopLeft).add(pxBottomLeft);
        var pxBounds = L.bounds([ pxTopLeft, pxTopRight, pxBottomLeft, pxBottomRight ]);
        var size = pxBounds.getSize();
        var pxTopLeftInDiv = pxTopLeft.subtract(pxBounds.min);
        var vectorX = pxTopRight.subtract(pxTopLeft);
        var vectorY = pxBottomLeft.subtract(pxTopLeft);
        var skewX = Math.atan2(vectorX.y, vectorX.x);
        var skewY = Math.atan2(vectorY.x, vectorY.y);
        this._bounds = L.latLngBounds(this._map.layerPointToLatLng(pxBounds.min), this._map.layerPointToLatLng(pxBounds.max));
        L.DomUtil.setPosition(div, pxBounds.min);
        div.style.width = size.x + "px";
        div.style.height = size.y + "px";
        var imgW = this._rawImage.width;
        var imgH = this._rawImage.height;
        if (!imgW || !imgH) {
            return;
        }
        var scaleX = pxTopLeft.distanceTo(pxTopRight) / imgW * Math.cos(skewX);
        var scaleY = pxTopLeft.distanceTo(pxBottomLeft) / imgH * Math.cos(skewY);
        this._rawImage.style.transformOrigin = "0 0";
        this._rawImage.style.transform = "translate(" + pxTopLeftInDiv.x + "px, " + pxTopLeftInDiv.y + "px)" + "skew(" + skewY + "rad, " + skewX + "rad) " + "scale(" + scaleX + ", " + scaleY + ") ";
    },
    reposition: function(topleft, topright, bottomleft) {
        this._topLeft = L.latLng(topleft);
        this._topRight = L.latLng(topright);
        this._bottomLeft = L.latLng(bottomleft);
        this._reset();
    }
});

L.imageOverlay.rotated = function(imgSrc, topleft, topright, bottomleft, options) {
    return new L.ImageOverlay.Rotated(imgSrc, topleft, topright, bottomleft, options);
};

L.ImageOverlayTransform = {
    pointOnLine: function(start, final, distPx) {
        var ratio = 1 + distPx / start.distanceTo(final);
        return new L.Point(start.x + (final.x - start.x) * ratio, start.y + (final.y - start.y) * ratio);
    }
};

L.ImageOverlayTransform.Handle = L.CircleMarker.extend({
    options: {
        name: null,
        radius: 5,
        fillColor: "#ffffff",
        color: "#202020",
        fillOpacity: 1,
        weight: 2,
        opacity: 1,
        cursor: "all-scroll",
        className: "leaflet-image-overlay-transform-handler"
    },
    onAdd: function(map) {
        L.CircleMarker.prototype.onAdd.call(this, map);
        if (this._path) {
            this._path.style.cursor = this.options.cursor;
        }
    }
});

L.Handler.ImageOverlayTransform = L.Handler.extend({
    options: {
        rotatable: true,
        scalable: true,
        draggable: true,
        bounds: [],
        topLeftHandler: {
            name: "topLeftHandler",
            className: "leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--topleft"
        },
        topRightHandler: {
            name: "topRightHandler",
            className: "leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--topright"
        },
        bottomLeftHandler: {
            name: "bottomLeftHandler",
            className: "leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--bottomleft"
        },
        bottomRightHandler: {
            name: "bottomRightHandler",
            className: "leaflet-image-overlay-transform-handler transform-handler--scale transform-handler--scale--bottomright"
        },
        rotationHandler: {
            name: "rotationHandler",
            className: "leaflet-image-overlay-transform-handler transform-handler--rotate",
            cursor: "pointer"
        },
        line: {
            weight: 1,
            opacity: 1,
            dashArray: [ 3, 3 ],
            fill: false
        }
    },
    initialize: function(layer) {
        this._layer = layer;
        this._map = null;
        this._polygon = null;
        this._handlers = [];
        this._bounds = [];
    },
    addHooks: function() {
        this._updateHandlers();
        this._map.on("zoomend", this._onMapZoomEnd, this);
        this._layer.on("mousedown", this._onDragStart, this);
    },
    removeHooks: function() {
        this._removeHandlers();
        this._map.off("zoomend", this._onMapZoomEnd, this);
        this._layer.off("mousedown", this._onDragStart, this);
    },
    enable: function(options) {
        var layer = this._layer;
        if (options) {
            this.setOptions(options);
        }
        if (layer._map) {
            this._map = layer._map;
        }
        if (!this.options.bounds || this.options.bounds.length !== 4) {
            var layerBounds = layer._bounds;
            var bounds = [ layerBounds.getSouthWest(), layerBounds.getNorthWest(), layerBounds.getNorthEast(), layerBounds.getSouthEast() ];
        } else {
            var bounds = this.options.bounds;
        }
        this.setBounds(bounds);
        return L.Handler.prototype.enable.call(this);
    },
    setOptions: function(options) {
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
    setBounds: function(newBounds) {
        var layer = this._layer;
        this._bounds = newBounds;
        layer.reposition(newBounds[1], newBounds[2], newBounds[0]);
        this._updateHandlers();
        this._calculateCenterPoint();
    },
    hideHandlers: function() {
        this._map.removeLayer(this._handlersGroup);
    },
    showHandlers: function() {
        this._handlersGroup.addTo(this._map);
    },
    getRadian: function() {
        var map = this._map;
        var bounds = this._bounds;
        var topLeftPoint = map.latLngToLayerPoint(bounds[1]);
        var bottomLeftPoint = map.latLngToLayerPoint(bounds[0]);
        var topRightPoint = map.latLngToLayerPoint(bounds[2]);
        var bottomRightPoint = map.latLngToLayerPoint(bounds[3]);
        var dx1 = topLeftPoint.x - bottomLeftPoint.x;
        var dy1 = topLeftPoint.y - bottomLeftPoint.y;
        var dx2 = topRightPoint.x - bottomRightPoint.x;
        var dy2 = topRightPoint.y - bottomRightPoint.y;
        var radian = 0;
        if (dy1 < 0) {
            radian = -Math.atan(dx1 / dy1);
        } else {
            radian = Math.PI - Math.atan(dx2 / dy2);
        }
        return radian;
    },
    getCenter: function() {
        var map = this._map;
        var centerPoint = this._centerPoint;
        return map.layerPointToLatLng(centerPoint);
    },
    rotate: function(radian) {
        while (radian > 2 * Math.PI) {
            radian /= 2 * Math.PI;
        }
        var layer = this._layer;
        var bounds = this._rotateBounds(radian);
        this._bounds = bounds;
        layer.reposition(bounds[1], bounds[2], bounds[0]);
        this._updateHandlers();
    },
    moveTo: function(newCenter) {
        var map = this._map;
        var layer = this._layer;
        var centerPoint = this._centerPoint;
        var newCenterPoint = map.latLngToLayerPoint(newCenter);
        this._centerPoint = newCenterPoint;
        var dx = newCenterPoint.x - centerPoint.x;
        var dy = newCenterPoint.y - centerPoint.y;
        if (dx || dy) {
            var bounds = this._moveBounds(dx, dy);
            this._bounds = bounds;
            layer.reposition(bounds[1], bounds[2], bounds[0]);
            this._updateHandlers();
        }
    },
    _onMapZoomEnd: function() {
        var map = this._map;
        var layer = this._layer;
        this._updateHandlers();
        this._centerPoint = map.latLngToLayerPoint(layer._bounds.getCenter());
    },
    _onDragStart: function(e) {
        var map = this._map;
        var layer = this._layer;
        var bounds = this._bounds;
        this._dragging = true;
        this._startPoint = e.layerPoint;
        this._startBounds = this._bounds;
        layer.bringToFront();
        if (map.dragging.enabled()) {
            map.dragging.disable();
        }
        map.on("mousemove", this._onDrag, this).on("mouseup", this._onDragEnd, this);
        layer.fire("dragstart", {
            bounds: bounds
        });
    },
    _onDrag: function(e) {
        if (this._dragging) {
            var map = this._map;
            var layer = this._layer;
            var startBounds = this._startBounds;
            var startPoint = this._startPoint;
            var currentPoint = e.layerPoint;
            var dx = currentPoint.x - startPoint.x;
            var dy = currentPoint.y - startPoint.y;
            if (dx || dy) {
                var bounds = this._moveBounds(dx, dy, startBounds);
                this._bounds = bounds;
                layer.reposition(bounds[1], bounds[2], bounds[0]);
                this._updateHandlers();
                this._layer.fire("drag", {
                    bounds: bounds
                });
            }
        }
    },
    _onDragEnd: function() {
        if (this._dragging) {
            var map = this._map;
            var layer = this._layer;
            var bounds = this._bounds;
            map.dragging.enable();
            delete this._dragging;
            delete this._startPoint;
            delete this._startBounds;
            this._calculateCenterPoint();
            layer.fire("dragend", {
                bounds: bounds
            });
        }
    },
    _onScaleStart: function(e) {
        var map = this._map;
        var layer = this._layer;
        var bounds = this._bounds;
        this._scaling = true;
        this._startPoint = e.layerPoint;
        this._startBounds = bounds;
        this._activeMarker = e.target;
        this._radian = this.getRadian();
        layer.bringToFront();
        if (map.dragging.enabled()) {
            map.dragging.disable();
        }
        map.on("mousemove", this._onScale, this).on("mouseup", this._onScaleEnd, this);
        layer.fire("scalestart", {
            bounds: bounds
        });
    },
    _onScale: function(e) {
        if (this._scaling) {
            var startPoint = this._startPoint;
            var currentPoint = e.layerPoint;
            var dx = currentPoint.x - startPoint.x;
            var dy = currentPoint.y - startPoint.y;
            if (dx || dy) {
                var map = this._map;
                var layer = this._layer;
                var startBounds = this._startBounds;
                var bounds = startBounds;
                var radian = this._radian;
                var layerLatLng = map.layerPointToLatLng(currentPoint);
                var activeMarker = this._activeMarker;
                switch (activeMarker.options.name) {
                  case "bottomLeftHandler":
                    bounds[0] = layerLatLng;
                    var bounds2 = this._rotateBounds(-radian, bounds);
                    bounds2[3] = L.latLng(bounds2[0].lat, bounds2[2].lng);
                    bounds2[1] = L.latLng(bounds2[2].lat, bounds2[0].lng);
                    break;

                  case "topLeftHandler":
                    bounds[1] = layerLatLng;
                    var bounds2 = this._rotateBounds(-radian, bounds);
                    bounds2[0] = L.latLng(bounds2[3].lat, bounds2[1].lng);
                    bounds2[2] = L.latLng(bounds2[1].lat, bounds2[3].lng);
                    break;

                  case "topRightHandler":
                    bounds[2] = layerLatLng;
                    var bounds2 = this._rotateBounds(-radian, bounds);
                    bounds2[3] = L.latLng(bounds2[0].lat, bounds2[2].lng);
                    bounds2[1] = L.latLng(bounds2[2].lat, bounds2[0].lng);
                    break;

                  case "bottomRightHandler":
                    bounds[3] = layerLatLng;
                    var bounds2 = this._rotateBounds(-radian, bounds);
                    bounds2[0] = L.latLng(bounds2[3].lat, bounds2[1].lng);
                    bounds2[2] = L.latLng(bounds2[1].lat, bounds2[3].lng);
                    break;
                }
                bounds = this._rotateBounds(radian, bounds2);
                this._bounds = bounds;
                layer.reposition(bounds[1], bounds[2], bounds[0]);
                this._updateHandlers();
                layer.fire("scale", {
                    bounds: bounds
                });
            }
        }
    },
    _onScaleEnd: function() {
        if (this._scaling) {
            var map = this._map;
            var layer = this._layer;
            var bounds = this._bounds;
            map.dragging.enable();
            delete this._scaling;
            delete this._startPoint;
            delete this._startBounds;
            delete this._activeMarker;
            delete this._radian;
            this._calculateCenterPoint();
            layer.fire("scaleend", {
                bounds: bounds
            });
        }
    },
    _onRotateStart: function(e) {
        var map = this._map;
        var layer = this._layer;
        var bounds = this._bounds;
        this._rotating = true;
        this._startPoint = e.layerPoint;
        this._startBounds = bounds;
        layer.bringToFront();
        if (map.dragging.enabled()) {
            map.dragging.disable();
        }
        map.on("mousemove", this._onRotate, this).on("mouseup", this._onRotateEnd, this);
        layer.fire("rotatestart", {
            bounds: bounds
        });
    },
    _onRotate: function(e) {
        if (this._rotating) {
            var map = this._map;
            var layer = this._layer;
            var startPoint = this._startPoint;
            var startBounds = this._startBounds;
            var currentPoint = e.layerPoint;
            var centerPoint = this._centerPoint;
            var radian = Math.atan2(currentPoint.y - centerPoint.y, currentPoint.x - centerPoint.x) - Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
            while (radian > 2 * Math.PI) {
                radian /= 2 * Math.PI;
            }
            var bounds = this._rotateBounds(radian, startBounds);
            this._bounds = bounds;
            layer.reposition(bounds[1], bounds[2], bounds[0]);
            this._updateHandlers();
            layer.fire("rotate", {
                bounds: bounds
            });
        }
    },
    _onRotateEnd: function() {
        if (this._rotating) {
            var map = this._map;
            var layer = this._layer;
            var bounds = this._bounds;
            map.dragging.enable();
            delete this._rotating;
            delete this._startPoint;
            delete this._startBounds;
            layer.fire("rotateend", {
                bounds: bounds
            });
        }
    },
    _createHandlers: function() {
        var map = this._map;
        var bounds = this._bounds;
        if (map) {
            this._handlers = {};
            this._handlersGroup = this._handlersGroup || new L.LayerGroup().addTo(map);
            this._polygon = new L.Polygon(this._bounds, L.extend({
                pane: this._layer.options.pane
            }, this.options.line)).addTo(this._handlersGroup);
            if (this.options.scalable) {
                var edges = [ "bottomLeftHandler", "topLeftHandler", "topRightHandler", "bottomRightHandler" ];
                var edgeOptionsArr = [ this.options.bottomLeftHandler, this.options.topLeftHandler, this.options.topRightHandler, this.options.bottomRightHandler ];
                for (var i = 0; i < 4; i++) {
                    this._handlers[edges[i]] = new L.ImageOverlayTransform.Handle(bounds[i], L.extend({
                        name: edges[i],
                        pane: this._layer.options.pane
                    }, edgeOptionsArr[i])).on("mousedown", this._onScaleStart, this).addTo(this._handlersGroup);
                }
            }
            if (this.options.rotatable) {
                var bottomPoint = new L.LatLng((bounds[0].lat + bounds[3].lat) / 2, (bounds[0].lng + bounds[3].lng) / 2);
                var topPoint = new L.LatLng((bounds[1].lat + bounds[2].lat) / 2, (bounds[1].lng + bounds[2].lng) / 2);
                var handlerPosition = map.layerPointToLatLng(L.ImageOverlayTransform.pointOnLine(map.latLngToLayerPoint(bottomPoint), map.latLngToLayerPoint(topPoint), 20));
                this._rotationLine = new L.Polyline([ topPoint, handlerPosition ], L.extend({
                    pane: this._layer.options.pane
                }, this.options.line)).addTo(this._handlersGroup);
                this._handlers.rotation = new L.ImageOverlayTransform.Handle(handlerPosition, L.extend({
                    pane: this._layer.options.pane
                }, this.options.rotationHandler)).on("mousedown", this._onRotateStart, this).addTo(this._handlersGroup);
            }
        }
    },
    _removeHandlers: function() {
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
    _updateHandlers: function() {
        this._removeHandlers();
        this._createHandlers();
    },
    _rotateBounds: function(radian, startBounds) {
        startBounds = startBounds || this._bounds;
        var map = this._map;
        var centerPoint = this._centerPoint;
        var bounds = [];
        var sin = Math.sin(radian);
        var cos = Math.cos(radian);
        for (var point, i = 0; i < 4; i++) {
            point = map.latLngToLayerPoint(startBounds[i]);
            point.x -= centerPoint.x;
            point.y -= centerPoint.y;
            bounds.push(map.layerPointToLatLng(L.point([ centerPoint.x + point.x * cos - point.y * sin, centerPoint.y + point.x * sin + point.y * cos ])));
        }
        return bounds;
    },
    _moveBounds: function(dx, dy, startBounds) {
        startBounds = startBounds || this._bounds;
        var map = this._map;
        var bounds = [];
        for (var point, i = 0; i < 4; i++) {
            point = map.latLngToLayerPoint(startBounds[i]);
            point.x += dx;
            point.y += dy;
            bounds.push(map.layerPointToLatLng(point));
        }
        return bounds;
    },
    _calculateCenterPoint: function() {
        var map = this._map;
        var bounds = this._bounds;
        var topLeftPoint = map.latLngToLayerPoint(bounds[1]);
        var bottomRightPoint = map.latLngToLayerPoint(bounds[3]);
        this._centerPoint = L.point((topLeftPoint.x + bottomRightPoint.x) / 2, (topLeftPoint.y + bottomRightPoint.y) / 2);
    }
});

L.ImageOverlay.addInitHook(function() {
    if (this.options.transform) {
        this.transform = new L.Handler.ImageOverlayTransform(this);
        this.options.interactive = true;
    }
});