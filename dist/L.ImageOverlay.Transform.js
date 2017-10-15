L.ImageOverlay.Transform = {};

L.ImageOverlay.Transform.Marker = L.CircleMarker.extend({
    options: {
        name: null,
        radius: 5,
        fillColor: "#ffffff",
        color: "#202020",
        fillOpacity: 1,
        weight: 2,
        opacity: 1,
        cursor: "all-scroll",
        className: "leaflet-image-overlay-transform-marker"
    },
    onAdd: function(map) {
        L.CircleMarker.prototype.onAdd.call(this, map);
        var path = this._path;
        var options = this.options;
        if (path) {
            if (options.cursor) {
                path.style.cursor = options.cursor;
            }
            if (options.name) {
                L.DomUtil.addClass(path, "leaflet-image-overlay-transform-marker--" + options.name);
            }
        }
    },
    setCursor: function(cursor) {
        var path = this._path;
        path.style.cursor = cursor;
    }
});

L.ImageOverlay.Transform = L.ImageOverlay.extend({
    options: {
        rotatable: true,
        scalable: true,
        draggable: true,
        keepRatio: false,
        fit: true,
        markerClass: L.ImageOverlay.Transform.Marker,
        lineGuideOptions: {
            weight: 1,
            opacity: 1,
            dashArray: [ 3, 3 ],
            fill: false
        }
    },
    initialize: function(image, latlngs, options) {
        this._polygon = null;
        this._handlers = null;
        this._handlersGroup = null;
        this._parseLatLngs(latlngs);
        if (typeof image === "string") {
            this._url = image;
        } else {
            this._rawImage = image;
        }
        this.setOptions(options);
    },
    onAdd: function(map) {
        var options = this.options;
        var element = this._image;
        if (!element) {
            this._initImage();
            element = this._image;
        }
        if (options.opacity < 1) {
            this._updateOpacity();
        }
        var rawImage = this._rawImage;
        L.DomUtil.addClass(rawImage, "leaflet-interactive");
        this.addInteractiveTarget(rawImage);
        this.getPane().appendChild(element);
        map.on("zoomend resetview", this._reset, this).on("zoomend", this._onMapZoomEnd, this).on("mouseup mouseout", this._endAction, this);
        this.on("mousedown", this._onDragStart, this);
        this._map = map;
        this._reset();
        this._resetMarkers();
    },
    onRemove: function(map) {
        map.off("zoomend resetview", this._reset, this).off("zoomend", this._onMapZoomEnd, this);
        this.off("mousedown", this._onDragStart, this);
        this._removeMarkers();
        L.ImageOverlay.prototype.onRemove.call(this, map);
    },
    setOptions: function(options) {
        options = L.extend({}, this.options, options);
        this.options.interactive = true;
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
        if (options.fit) {
            this._fit = true;
        }
        if (options.minWidth) {
            this._minWidth = options.minWidth;
        }
        if (options.minHeight) {
            this._minHeight = options.minHeight;
        }
        if (options.keepRatio) {
            this._keepRatio = true;
        }
        if (options.lineGuideOptions) {
            this._lineGuideOptions = options.lineGuideOptions;
        }
        if (options.markerClass) {
            this._markerClass = options.markerClass;
        }
        this._reset();
        this._resetMarkers();
    },
    getLatLngs: function() {
        return this._latlngs;
    },
    setLatLngs: function(latlngs) {
        this._parseLatLngs(latlngs);
        this._reset();
        this._resetMarkers();
    },
    setUrl: function(url) {
        this._url = url;
        if (this._rawImage) {
            this._rawImage.src = url;
        }
        return this;
    },
    _onMapZoomEnd: function() {
        this._resetMarkers();
    },
    _onDragStart: function(e) {
        var draggable = this._draggable;
        if (draggable) {
            var map = this._map;
            var latlngs = this._latlngs;
            this._dragging = true;
            this._startPoint = e.layerPoint;
            this._startLatLngs = latlngs;
            this.bringToFront();
            if (map.dragging.enabled()) {
                this._disabledDrag = true;
                map.dragging.disable();
            }
            map.on("mousemove", this._onDrag, this).on("mouseup", this._onDragEnd, this);
            this.fire("dragstart", {
                latlngs: latlngs
            });
        }
    },
    _onDrag: function(e) {
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
                this.fire("drag", {
                    latlngs: latlngs
                });
            }
        }
    },
    _onDragEnd: function() {
        var map = this._map;
        if (this._disabledDrag) {
            map.dragging.enable();
            delete this._disabledDrag;
        }
        if (this._dragging) {
            var latlngs = this._latlngs;
            delete this._dragging;
            delete this._startPoint;
            delete this._startLatLngs;
            this.fire("dragend", {
                latlngs: latlngs
            });
        }
    },
    _onScaleStart: function(e) {
        var scalable = this._scalable;
        if (scalable) {
            var map = this._map;
            var latlngs = this._latlngs;
            this._scaling = true;
            this._startPoint = e.layerPoint;
            this._startLatLngs = latlngs.slice(0);
            this._activeMarkerName = e.target.options.name;
            this._startDiagonal = this._diagonal;
            this.bringToFront();
            if (map.dragging.enabled()) {
                this._disabledDrag = true;
                map.dragging.disable();
            }
            map.on("mousemove", this._onScale, this).on("mouseup", this._onScaleEnd, this);
            this.fire("scalestart", {
                latlngs: latlngs
            });
        }
    },
    _onScale: function(e) {
        if (this._scaling) {
            var startPoint = this._startPoint;
            var currentPoint = e.layerPoint;
            var dx = currentPoint.x - startPoint.x;
            var dy = currentPoint.y - startPoint.y;
            if (dx || dy) {
                var map = this._map;
                var startDiagonal = this._startDiagonal;
                var startLatLngs = this._startLatLngs;
                var activeMarkerName = this._activeMarkerName;
                var keepRatio = this._keepRatio;
                var latlngs = this._scaleLatLngs(dx, dy, activeMarkerName, startLatLngs, keepRatio, startDiagonal);
                this.setLatLngs(latlngs);
                this.fire("scale", {
                    latlngs: latlngs
                });
            }
        }
    },
    _onScaleEnd: function() {
        var map = this._map;
        if (this._disabledDrag) {
            map.dragging.enable();
            delete this._disabledDrag;
        }
        if (this._scaling) {
            var latlngs = this._latlngs;
            delete this._scaling;
            delete this._startPoint;
            delete this._startLatLngs;
            delete this._activeMarker;
            delete this._radian;
            delete this._startWidth;
            delete this._startHeight;
            this.fire("scaleend", {
                latlngs: latlngs
            });
        }
    },
    _onRotateStart: function(e) {
        var rotatable = this._rotatable;
        if (rotatable) {
            var map = this._map;
            var latlngs = this._latlngs;
            this._rotating = true;
            this._startPoint = e.layerPoint;
            this._startLatLngs = latlngs.slice(0);
            this.bringToFront();
            if (map.dragging.enabled()) {
                this._disabledDrag = true;
                map.dragging.disable();
            }
            map.on("mousemove", this._onRotate, this).on("mouseup", this._onRotateEnd, this);
            this.fire("rotatestart", {
                latlngs: latlngs
            });
        }
    },
    _onRotate: function(e) {
        if (this._rotating) {
            var map = this._map;
            var startPoint = this._startPoint;
            var startLatLngs = this._startLatLngs;
            var currentPoint = e.layerPoint;
            var centerPoint = map.latLngToLayerPoint(this._getCenterOfLatLngs(startLatLngs));
            var radian = Math.atan2(currentPoint.y - centerPoint.y, currentPoint.x - centerPoint.x) - Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
            while (radian > 2 * Math.PI) {
                radian /= 2 * Math.PI;
            }
            var latlngs = this._rotateLatLngs(radian, startLatLngs, centerPoint);
            this.setLatLngs(latlngs);
            this.fire("rotate", {
                latlngs: latlngs
            });
        }
    },
    _onRotateEnd: function() {
        var map = this._map;
        if (this._disabledDrag) {
            map.dragging.enable();
            delete this._disabledDrag;
        }
        if (this._rotating) {
            var latlngs = this._latlngs;
            delete this._rotating;
            delete this._startPoint;
            delete this._startLatLngs;
            this.fire("rotateend", {
                latlngs: latlngs
            });
        }
    },
    _endAction: function() {
        this._onDragEnd();
        this._onScaleEnd();
        this._onRotateEnd();
    },
    _reset: function() {
        var map = this._map;
        if (!map) {
            return;
        }
        var rawImage = this._rawImage;
        var element = this._image;
        var latlngs = this._latlngs;
        var topLeftPoint = map.latLngToLayerPoint(this._topLeft);
        var topRightPoint = map.latLngToLayerPoint(this._topRight);
        var bottomLeftPoint = map.latLngToLayerPoint(this._bottomLeft);
        var bottomRightPoint = map.latLngToLayerPoint(this._bottomRight);
        var boundsPoint = L.bounds([ topLeftPoint, topRightPoint, bottomLeftPoint, bottomRightPoint ]);
        var size = boundsPoint.getSize();
        var topLeftPointInElement = topLeftPoint.subtract(boundsPoint.min);
        var vectorX = topRightPoint.subtract(topLeftPoint);
        var vectorY = bottomLeftPoint.subtract(topLeftPoint);
        var skewX = Math.atan2(vectorX.y, vectorX.x);
        var skewY = Math.atan2(vectorY.x, vectorY.y);
        this._bounds = L.latLngBounds(map.layerPointToLatLng(boundsPoint.min), map.layerPointToLatLng(boundsPoint.max));
        var imageWidth = rawImage.width;
        var imageHeight = rawImage.height;
        if (!imageWidth && !imageHeight) {
            return;
        }
        var fit = this._fit;
        var width = Math.ceil(topLeftPoint.distanceTo(topRightPoint));
        var height = Math.ceil(topLeftPoint.distanceTo(bottomLeftPoint));
        var ratio = width / height;
        var imageRatio = imageWidth / imageHeight;
        if (!fit) {
            if (imageRatio > ratio) {
                latlngs = this._latlngs = this._scaleLatLngs(0, width / imageRatio - height, "bottomRight", latlngs.slice(0), false);
                height = Math.ceil(width / imageRatio);
            } else {
                latlngs = this._latlngs = this._scaleLatLngs(height * imageRatio - width, 0, "topRight", latlngs.slice(0), false);
                width = Math.ceil(height * imageRatio);
            }
            this._parseLatLngs(latlngs);
            this._resetMarkers();
            this._fit = true;
        }
        this._width = width;
        this._height = height;
        var topLeftPoint = map.latLngToLayerPoint(this._topLeft);
        var bottomRightPoint = map.latLngToLayerPoint(this._bottomRight);
        this._diagonal = Math.ceil(topLeftPoint.distanceTo(bottomRightPoint));
        element.style.width = width + "px";
        element.style.height = height + "px";
        L.DomUtil.setPosition(element, boundsPoint.min);
        var scaleX = width / imageWidth * Math.cos(skewX);
        var scaleY = height / imageHeight * Math.cos(skewY);
        rawImage.style.transformOrigin = "0px 0px 0px";
        rawImage.style.transform = "translate(" + topLeftPointInElement.x + "px, " + topLeftPointInElement.y + "px) " + "skew(" + skewY + "rad, " + skewX + "rad) " + "scale(" + scaleX + ", " + scaleY + ") ";
    },
    _initImage: function() {
        var url = this._url;
        var rawImage = this._rawImage;
        var options = this.options;
        if (url) {
            rawImage = this._rawImage = L.DomUtil.create("img");
            rawImage.style.display = "none";
            rawImage.src = url;
            if (options.crossOrigin) {
                rawImage.crossOrigin = "";
            }
        }
        rawImage.alt = options.alt;
        L.DomUtil.addClass(rawImage, "leaflet-image-layer");
        var element = this._image = L.DomUtil.create("div", "leaflet-image-layer leaflet-zoom-animated leaflet-image-transform");
        element.appendChild(rawImage);
        element.onselectstart = L.Util.falseFn;
        element.onmousemove = L.Util.falseFn;
        rawImage.onload = function() {
            this._reset();
            rawImage.style.display = "block";
            this.fire("load");
        }.bind(this);
    },
    _parseLatLngs: function(latlngs) {
        this._latlngs = latlngs;
        this._bottomLeft = L.latLng(latlngs[0]);
        this._topLeft = L.latLng(latlngs[1]);
        this._topRight = L.latLng(latlngs[2]);
        this._bottomRight = L.latLng(latlngs[3]);
    },
    _getCenterOfLatLngs: function(latlngs) {
        return this._getCenterOf2LatLngs(latlngs[1], latlngs[3]);
    },
    _getCenterOf2LatLngs: function(latlngA, latlngB) {
        var map = this._map;
        if (map) {
            var pointA = map.latLngToLayerPoint(latlngA);
            var pointB = map.latLngToLayerPoint(latlngB);
            return map.layerPointToLatLng(L.point((pointA.x + pointB.x) / 2, (pointA.y + pointB.y) / 2));
        }
        return L.latLng((latlngA.lat + latlngB.lat) / 2, (latlngA.lng + latlngB.lng) / 2);
    },
    _getRadianFromLatLngs: function(latlngs) {
        var map = this._map;
        if (!map) {
            return;
        }
        var bottomLeftPoint = map.latLngToLayerPoint(latlngs[0]);
        var topLeftPoint = map.latLngToLayerPoint(latlngs[1]);
        var topRightPoint = map.latLngToLayerPoint(latlngs[2]);
        var bottomRightPoint = map.latLngToLayerPoint(latlngs[3]);
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
    _scaleLatLngs: function(dx, dy, pointName, latlngs, keepRatio, diagonal) {
        var map = this._map;
        if (!map) {
            return;
        }
        var centerPoint = map.latLngToLayerPoint(this._getCenterOfLatLngs(latlngs));
        var latlngsClone = latlngs.slice(0);
        var radian = this._getRadianFromLatLngs(latlngsClone);
        var latlngsCloneIndex;
        var bottomLeftPoint = map.latLngToLayerPoint(latlngs[0]);
        var topLeftPoint = map.latLngToLayerPoint(latlngs[1]);
        var topRightPoint = map.latLngToLayerPoint(latlngs[2]);
        var bottomRightPoint = map.latLngToLayerPoint(latlngs[3]);
        switch (pointName) {
          case "bottomLeft":
            latlngsCloneIndex = 0;
            break;

          case "bottom":
            latlngsCloneIndex = 0;
            dx = 0;
            break;

          case "topLeft":
            latlngsCloneIndex = 1;
            if (keepRatio) {}
            break;

          case "left":
            latlngsCloneIndex = 1;
            dy = 0;
            break;

          case "topRight":
            latlngsCloneIndex = 2;
            if (keepRatio) {}
            break;

          case "top":
            latlngsCloneIndex = 2;
            dx = 0;
            break;

          case "bottomRight":
            latlngsCloneIndex = 3;
            if (keepRatio) {}
            break;

          case "right":
            latlngsCloneIndex = 3;
            dy = 0;
            break;
        }
        var startPoint = map.latLngToLayerPoint(latlngsClone[latlngsCloneIndex]);
        var newPoint = L.point(startPoint.x + (dx || 0), startPoint.y + (dy || 0));
        if (keepRatio) {
            var oppositePointIndex = (latlngsCloneIndex + 2) % 4;
            var oppositePoint = map.latLngToLayerPoint(latlngsClone[oppositePointIndex]);
            var currentDiagonal = oppositePoint.distanceTo(newPoint);
            var ratio = currentDiagonal / diagonal;
            var newPoint = L.point(oppositePoint.x + (startPoint.x - oppositePoint.x) * ratio, oppositePoint.y + (startPoint.y - oppositePoint.y) * ratio);
        }
        latlngsClone[latlngsCloneIndex] = map.layerPointToLatLng(newPoint);
        if (radian && radian !== 0) {
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
        if (radian && radian !== 0) {
            latlngsClone = this._rotateLatLngs(radian, latlngsClone, centerPoint);
        }
        return latlngsClone;
    },
    _moveLatLngs: function(dx, dy, latlngs) {
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
    _rotateLatLngs: function(radian, latlngs, centerPoint) {
        var map = this._map;
        if (!map) {
            return;
        }
        var centerPoint = centerPoint || map.latLngToLayerPoint(this._getCenterOfLatLngs(latlngs));
        var sin = Math.sin(radian) || 0;
        var cos = Math.cos(radian) || 0;
        var newLatLngs = [];
        for (var point, i = 0; i < 4; i++) {
            point = map.latLngToLayerPoint(latlngs[i]);
            point.x -= centerPoint.x;
            point.y -= centerPoint.y;
            newLatLngs.push(map.layerPointToLatLng(L.point([ centerPoint.x + point.x * cos - point.y * sin, centerPoint.y + point.x * sin + point.y * cos ])));
        }
        return newLatLngs;
    },
    _createMarkers: function() {
        var map = this._map;
        if (!map) {
            return;
        }
        var markerClass = this._markerClass;
        var latlngs = this._latlngs;
        var bottomLeft = this._bottomLeft;
        var topLeft = this._topLeft;
        var topRight = this._topRight;
        var bottomRight = this._bottomRight;
        var scalable = this._scalable;
        var rotatable = this._rotatable;
        var lineGuideOptions = this._lineGuideOptions;
        var keepRatio = this._keepRatio;
        var handlers = this._handlers = {};
        var handlersGroup = this._handlersGroup = this._handlersGroup || new L.LayerGroup();
        var polylineLatLngs = [ bottomLeft, topLeft, topRight, bottomRight, bottomLeft ];
        var guideLine = L.polyline(polylineLatLngs, lineGuideOptions);
        handlers.guideLine = guideLine;
        handlersGroup.addLayer(guideLine);
        if (rotatable) {
            var middleTopLatLng = this._getCenterOf2LatLngs(topLeft, topRight);
            var middleBottomPoint = map.latLngToLayerPoint(this._getCenterOf2LatLngs(bottomLeft, bottomRight));
            var middleTopPoint = map.latLngToLayerPoint(this._getCenterOf2LatLngs(topLeft, topRight));
            var distance = middleBottomPoint.distanceTo(middleTopPoint);
            var ratio;
            if (distance != 0) {
                ratio = 20 / distance + 1;
            } else {
                ratio = 1;
            }
            var rotationMarkerLatLng = map.layerPointToLatLng(L.point(middleBottomPoint.x + (middleTopPoint.x - middleBottomPoint.x) * ratio, middleBottomPoint.y + (middleTopPoint.y - middleBottomPoint.y) * ratio));
            var rotationMarker = new markerClass(rotationMarkerLatLng, {
                name: "rotation"
            });
            rotationMarker.on("mousedown", this._onRotateStart, this);
            var line = L.polyline([ middleTopLatLng, rotationMarkerLatLng ], lineGuideOptions);
            handlers.rotation = rotationMarker;
            handlers.rotationLine = line;
            handlersGroup.addLayer(line);
            handlersGroup.addLayer(rotationMarker);
        }
        if (scalable) {
            var bottomLeftMarker = new markerClass(bottomLeft, {
                name: "bottomLeft"
            });
            var topLeftMarker = new markerClass(topLeft, {
                name: "topLeft"
            });
            var topRightMarker = new markerClass(topRight, {
                name: "topRight"
            });
            var bottomRightMarker = new markerClass(bottomRight, {
                name: "bottomRight"
            });
            bottomLeftMarker.on("mousedown", this._onScaleStart, this);
            topLeftMarker.on("mousedown", this._onScaleStart, this);
            topRightMarker.on("mousedown", this._onScaleStart, this);
            bottomRightMarker.on("mousedown", this._onScaleStart, this);
            handlers.bottomLeft = bottomLeftMarker;
            handlers.topLeft = topLeftMarker;
            handlers.topRight = topRightMarker;
            handlers.bottomRight = bottomRightMarker;
            handlersGroup.addLayer(bottomLeftMarker);
            handlersGroup.addLayer(topLeftMarker);
            handlersGroup.addLayer(topRightMarker);
            handlersGroup.addLayer(bottomRightMarker);
            if (!keepRatio) {
                var leftMarkerLatLng = this._getCenterOf2LatLngs(bottomLeft, topLeft);
                var leftMarker = new markerClass(leftMarkerLatLng, {
                    name: "left"
                });
                var topMarkerLatLng = this._getCenterOf2LatLngs(topLeft, topRight);
                var topMarker = new markerClass(topMarkerLatLng, {
                    name: "top"
                });
                var rightMarkerLatLng = this._getCenterOf2LatLngs(topRight, bottomRight);
                var rightMarker = new markerClass(rightMarkerLatLng, {
                    name: "right"
                });
                var bottomMarkerLatLng = this._getCenterOf2LatLngs(bottomRight, bottomLeft);
                var bottomMarker = new markerClass(bottomMarkerLatLng, {
                    name: "bottom"
                });
                leftMarker.on("mousedown", this._onScaleStart, this);
                topMarker.on("mousedown", this._onScaleStart, this);
                rightMarker.on("mousedown", this._onScaleStart, this);
                bottomMarker.on("mousedown", this._onScaleStart, this);
                handlers.left = leftMarker;
                handlers.top = topMarker;
                handlers.right = rightMarker;
                handlers.bottom = bottomMarker;
                handlersGroup.addLayer(leftMarker);
                handlersGroup.addLayer(topMarker);
                handlersGroup.addLayer(rightMarker);
                handlersGroup.addLayer(bottomMarker);
            }
        }
        handlersGroup.addTo(map);
    },
    _removeMarkers: function() {
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
    _resetMarkers: function() {
        this._removeMarkers();
        this._createMarkers();
    },
    _hideMarkers: function() {}
});

L.imageOverlay.transform = function(image, latlngs, options) {
    return new L.ImageOverlay.Transform(image, latlngs, options);
};