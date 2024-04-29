module.exports = {
  // Put an object into left, right or both eyes.
  // If it's a video sphere, take care of correct stereo mapping for both eyes (if full dome)
  // or half the sphere (if half dome)

  stereo_component: {
    schema: {
      eye: { type: "string", default: "left" },
      mode: { type: "string", default: "full" },
      split: { type: "string", default: "horizontal" },
      playOnClick: { type: "boolean", default: true },
    },
    init: function () {
      // Flag to acknowledge if 'click' on video has been attached to canvas
      // Keep in mind that canvas is the last thing initialized on a scene so have to wait for the event
      // or just check in every tick if is not undefined

      // Check if material is a video from html tag (object3D.material.map instanceof THREE.VideoTexture does not
      // always work

      if (
        this.el.getAttribute("material") !== null &&
        "src" in this.el.getAttribute("material") &&
        this.el.getAttribute("material").src !== ""
      ) {
        var src = this.el.getAttribute("material").src;
      }

      var object3D = this.el.object3D.children[0];

      // In A-Frame 0.2.0, objects are all groups so sphere is the first children
      // Check if it's a sphere w/ video material, and if so
      // Note that in A-Frame 0.2.0, sphere entities are THREE.SphereBufferGeometry, while in A-Frame 0.3.0,
      // sphere entities are THREE.BufferGeometry.

      var validGeometries = [THREE.SphereGeometry, THREE.BufferGeometry];
      var isValidGeometry = validGeometries.some(function (geometry) {
        return object3D.geometry instanceof geometry;
      });

      if (isValidGeometry) {
        // if half-dome mode, rebuild geometry (with default 100, radius, 64 width segments and 64 height segments)

        if (this.data.mode === "half") {
          var geo_def = this.el.getAttribute("geometry");
          var geometry = new THREE.SphereGeometry(
            geo_def.radius || 100,
            geo_def.segmentsWidth || 64,
            geo_def.segmentsHeight || 64,
            Math.PI / 2,
            Math.PI,
            0,
            Math.PI
          );
        } else {
          var geo_def = this.el.getAttribute("geometry");
          var geometry = new THREE.SphereGeometry(
            geo_def.radius || 100,
            geo_def.segmentsWidth || 64,
            geo_def.segmentsHeight || 64
          );
        }

        // Panorama in front

        object3D.rotation.y = Math.PI / 2;

        // Calculate texture offset and repeat and modify UV's
        // (cannot use in AFrame material params, since mappings are shared when pointing to the same texture,
        // thus, one eye overrides the other) -> https://stackoverflow.com/questions/16976365/two-meshes-same-texture-different-offset

        var axis = this.data.split === "horizontal" ? "y" : "x";

        // If left eye is set, and the split is horizontal, take the left half of the video texture.
        // If the split is set to vertical, take the top/upper half of the video texture.
        // UV texture coordinates start at the bottom left point of the texture, so y axis coordinates for left eye on vertical split
        // are 0.5 - 1.0, and for the right eye are 0.0 - 0.5

        var offset =
          this.data.eye === "left"
            ? axis === "y"
              ? { x: 0, y: 0 }
              : { x: 0, y: 0.5 }
            : axis === "y"
            ? { x: 0.5, y: 0 }
            : { x: 0, y: 0 };

        var repeat = axis === "y" ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 };

        var uvAttribute = geometry.attributes.uv;

        for (var i = 0; i < uvAttribute.count; i++) {
          var u = uvAttribute.getX(i) * repeat.x + offset.x;
          var v = uvAttribute.getY(i) * repeat.y + offset.y;

          uvAttribute.setXY(i, u, v);
        }

        // Needed in BufferGeometry to update UVs

        uvAttribute.needsUpdate = true;

        this.originalGeometry = object3D.geometry;
        object3D.geometry = geometry;

        this.videoEl = this.el.object3D.children[0].material.map.image;

        var self = this;

        self.videoEl.muted = true;
        self.videoEl.play();
      }
    },

    remove: function () {
      var object3D = this.el.object3D.children[0];
      object3D.geometry.dispose();
      if (this.originalGeometry) {
        object3D.geometry = this.originalGeometry;
      }
    },

    // On element update, put in the right layer, 0:both, 1:left, 2:right (spheres or not)

    update: function (oldData) {
      var object3D = this.el.object3D.children[0];
      var data = this.data;

      if (data.eye === "both") {
        object3D.layers.set(0);
      } else {
        object3D.layers.set(data.eye === "left" ? 1 : 2);
      }
    },

    tick: function (time) {
      // If this value is false, it means that (a) this is a video on a sphere [see init method]
      // and (b) of course, tick is not added

      if (this.data.playOnClick) {
        if (typeof this.el.sceneEl.canvas !== "undefined") {
          // Get video DOM

          this.videoEl = this.el.object3D.children[0].material.map.image;

          // On canvas click, play video element. Use self to not lose track of object into event handler

          var self = this;

          self.videoEl.muted = true;
          self.videoEl.play();

          // Signal that click event is added
          this.video_click_event_added = true;
        }
      }
    },
  },

  // Sets the 'default' eye viewed by camera in non-VR mode

  stereocam_component: {
    schema: {
      eye: { type: "string", default: "left" },
    },

    // Cam is not attached on init, so use a flag to do this once at 'tick'

    // Use update every tick if flagged as 'not changed yet'

    init: function () {
      // Flag to register if cam layer has already changed
      this.layer_changed = false;
    },

    tick: function (time) {
      var originalData = this.data;

      // If layer never changed

      if (!this.layer_changed) {
        // because stereocam component should be attached to an a-camera element
        // need to get down to the root PerspectiveCamera before addressing layers

        // Gather the children of this a-camera and identify types

        var childrenTypes = [];

        this.el.object3D.children.forEach(function (item, index, array) {
          childrenTypes[index] = item.type;
        });

        // Retrieve the PerspectiveCamera
        var rootIndex = childrenTypes.indexOf("PerspectiveCamera");
        var rootCam = this.el.object3D.children[rootIndex];

        if (originalData.eye === "both") {
          rootCam.layers.enable(1);
          rootCam.layers.enable(2);
        } else {
          rootCam.layers.enable(originalData.eye === "left" ? 1 : 2);
        }

        this.layer_changed = true;
      }
    },
  },
};
