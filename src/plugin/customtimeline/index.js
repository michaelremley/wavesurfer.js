/**
 * @typedef {Object} TimelineCustomPluginParams
 * @desc Extends the `WavesurferParams` wavesurfer was initialised with
 * @property {!string|HTMLElement} container CSS selector or HTML element where
 * the timeline should be drawn. This is the only required parameter.
 * @property {number} notchPercentHeight=90 Height of notches in percent
 * @property {string} unlabeledNotchColor='#c0c0c0' The colour of the notches
 * that do not have labels
 * @property {string} primaryColor='#000' The colour of the main notches
 * @property {string} secondaryColor='#c0c0c0' The colour of the secondary
 * notches
 * @property {string} primaryFontColor='#000' The colour of the labels next to
 * the main notches
 * @property {string} secondaryFontColor='#000' The colour of the labels next to
 * the secondary notches
 * @property {number} labelPadding=5 The padding between the label and the notch
 * @property {?number} zoomDebounce A debounce timeout to increase rendering
 * performance for large files
 * @property {string} fontFamily='Arial'
 * @property {number} fontSize=10 Font size of labels in pixels
 * @property {?number} duration Length of the track in seconds. Overrides
 * getDuration() for setting length of timeline
 * @property {function} measureLabelTimes -> function that returns measure times
 * to label
 * @property {function} beatLabelTimes -> function that returns beat times to
 * label
 * @property {?number} offset Offset for the timeline start in seconds. May also be
 * negative.
 * @property {?boolean} deferInit Set to true to manually call
 * `initPlugin('customtimeline')`
 */

/**
 * Adds a timeline to the waveform.
 *
 * @implements {PluginClass}
 * @extends {Observer}
 * @example
 * // es6
 * import TimelineCustomPlugin from 'wavesurfer.customtimeline.js';
 *
 * // commonjs
 * var TimelineCustomPlugin = require('wavesurfer.customtimeline.js');
 *
 * // if you are using <script> tags
 * var TimelineCustomPlugin = window.WaveSurfer.customtimeline;
 *
 * // ... initialising wavesurfer with the plugin
 * var wavesurfer = WaveSurfer.create({
 *   // wavesurfer options ...
 *   plugins: [
 *     TimelineCustomPlugin.create({
 *       // plugin options ...
 *     })
 *   ]
 * });
 */
export default class TimelineCustomPlugin {
    /**
     * Timeline plugin definition factory
     *
     * This function must be used to create a plugin definition which can be
     * used by wavesurfer to correctly instantiate the plugin.
     *
     * @param  {TimelineCustomPluginParams} params parameters use to initialise the plugin
     * @return {PluginDefinition} an object representing the plugin
     */
    static create(params) {
        return {
            name: 'customtimeline',
            deferInit: params && params.deferInit ? params.deferInit : false,
            params: params,
            instance: TimelineCustomPlugin
        };
    }

    // event handlers
    _onScroll = () => {
        if (this.wrapper && this.drawer.wrapper) {
            this.wrapper.scrollLeft = this.drawer.wrapper.scrollLeft;
        }
    };

    /**
     * @returns {void}
     */
    _onRedraw = () => this.render();

    _onReady = () => {
        const ws = this.wavesurfer;
        this.drawer = ws.drawer;
        this.pixelRatio = ws.drawer.params.pixelRatio;
        this.maxCanvasWidth = ws.drawer.maxCanvasWidth || ws.drawer.width;
        this.maxCanvasElementWidth =
            ws.drawer.maxCanvasElementWidth ||
            Math.round(this.maxCanvasWidth / this.pixelRatio);

        // add listeners
        ws.drawer.wrapper.addEventListener('scroll', this._onScroll);
        ws.on('redraw', this._onRedraw);
        ws.on('zoom', this._onZoom);

        this.render();
    };

    /**
     * @param {object} e Click event
     */
    _onWrapperClick = e => {
        e.preventDefault();
        const relX = 'offsetX' in e ? e.offsetX : e.layerX;
        this.fireEvent('click', relX / this.wrapper.scrollWidth || 0);
    };

    /**
     * Creates an instance of TimelineCustomPlugin.
     *
     * You probably want to use TimelineCustomPlugin.create()
     *
     * @param {TimelineCustomPluginParams} params Plugin parameters
     * @param {object} ws Wavesurfer instance
     */
    constructor(params, ws) {
        this.container =
            'string' == typeof params.container
                ? document.querySelector(params.container)
                : params.container;

        if (!this.container) {
            throw new Error('No container for wavesurfer customtimeline');
        }

        this.wavesurfer = ws;
        this.util = ws.util;
        this.params = Object.assign(
            {},
            {
                height: 20,
                notchPercentHeight: 90,
                labelPadding: 5,
                unlabeledNotchColor: '#c0c0c0',
                primaryColor: '#000',
                secondaryColor: '#c0c0c0',
                primaryFontColor: '#000',
                secondaryFontColor: '#c0c0c0',
                fontFamily: 'Arial',
                fontSize: 10,
                duration: null,
                zoomDebounce: false,
                formatLabelCallback: this.defaultFormatLabelCallback,
                measureLabelTimes: this.defaultMeasureLabelTimes,
                beatLabelTimes: this.defaultBeatLabelTimes,
                offset: 0
            },
            params
        );

        this.canvases = [];
        this.canvascontexts = [];
        this.wrapper = null;
        this.drawer = null;
        this.pixelRatio = null;
        this.maxCanvasWidth = null;
        this.maxCanvasElementWidth = null;
        /**
         * This event handler has to be in the constructor function because it
         * relies on the debounce function which is only available after
         * instantiation
         *
         * Use a debounced function if `params.zoomDebounce` is defined
         *
         * @returns {void}
         */
        this._onZoom = this.params.zoomDebounce
            ? this.wavesurfer.util.debounce(
                () => this.render(),
                this.params.zoomDebounce
            )
            : () => this.render();
    }

    /**
     * Initialisation function used by the plugin API
     */
    init() {
        // Check if ws is ready
        if (this.wavesurfer.isReady) {
            this._onReady();
        } else {
            this.wavesurfer.once('ready', this._onReady);
        }
    }

    /**
     * Destroy function used by the plugin API
     */
    destroy() {
        this.unAll();
        this.wavesurfer.un('redraw', this._onRedraw);
        this.wavesurfer.un('zoom', this._onZoom);
        this.wavesurfer.un('ready', this._onReady);
        this.wavesurfer.drawer.wrapper.removeEventListener(
            'scroll',
            this._onScroll
        );
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.removeEventListener('click', this._onWrapperClick);
            this.wrapper.parentNode.removeChild(this.wrapper);
            this.wrapper = null;
        }
    }

    /**
     * Create a timeline element to wrap the canvases drawn by this plugin
     *
     */
    createWrapper() {
        const wsParams = this.wavesurfer.params;
        this.container.innerHTML = '';
        this.wrapper = this.container.appendChild(
            document.createElement('customtimeline')
        );
        this.util.style(this.wrapper, {
            display: 'block',
            position: 'relative',
            userSelect: 'none',
            webkitUserSelect: 'none',
            height: `${this.params.height}px`
        });

        if (wsParams.fillParent || wsParams.scrollParent) {
            this.util.style(this.wrapper, {
                width: '100%',
                overflowX: 'hidden',
                overflowY: 'hidden'
            });
        }

        this.wrapper.addEventListener('click', this._onWrapperClick);
    }

    /**
     * Render the timeline (also updates the already rendered timeline)
     *
     */
    render() {
        if (!this.wrapper) {
            this.createWrapper();
        }
        this.updateCanvases();
        this.updateCanvasesPositioning();
        this.renderCanvases();
    }

    /**
     * Add new timeline canvas
     *
     */
    addCanvas() {
        const canvas = this.wrapper.appendChild(
            document.createElement('canvas')
        );
        this.canvases.push(canvas);
        this.canvascontexts.push(canvas.getContext('2d'));
        this.util.style(canvas, {
            position: 'absolute',
            zIndex: 4
        });
    }

    /**
     * Remove timeline canvas
     *
     */
    removeCanvas() {
        const canvas = this.canvases.pop();
        var context = this.canvascontexts.pop();
        canvas.parentElement.removeChild(canvas);
    }

    /**
     * Make sure the correct of timeline canvas elements exist and are cached in
     * this.canvases
     *
     */
    updateCanvases() {
        const totalWidth = Math.round(this.drawer.wrapper.scrollWidth);
        const requiredCanvases = Math.ceil(
            totalWidth / this.maxCanvasElementWidth
        );

        while (this.canvases.length < requiredCanvases) {
            this.addCanvas();
        }

        while (this.canvases.length > requiredCanvases) {
            this.removeCanvas();
        }
    }

    /**
     * Update the dimensions and positioning style for all the timeline canvases
     *
     */
    updateCanvasesPositioning() {
        // cache length for performance
        const canvasesLength = this.canvases.length;
        this.canvases.forEach((canvas, i) => {
            // canvas width is the max element width, or if it is the last the
            // required width
            const canvasWidth =
                i === canvasesLength - 1
                    ? this.drawer.wrapper.scrollWidth -
                      this.maxCanvasElementWidth * (canvasesLength - 1)
                    : this.maxCanvasElementWidth;
            // set dimensions and style
            canvas.width = canvasWidth * this.pixelRatio;
            // on certain pixel ratios the canvas appears cut off at the bottom,
            // therefore leave 1px extra
            canvas.height = (this.params.height + 1) * this.pixelRatio;
            this.util.style(canvas, {
                width: `${canvasWidth}px`,
                height: `${this.params.height}px`,
                left: `${i * this.maxCanvasElementWidth}px`
            });
        });
    }

    /**
     * Render the timeline labels and notches
     *
     */
    renderCanvases() {
        const duration =
            this.params.duration ||
            this.wavesurfer.backend.getDuration();

        if (duration <= 0) {
            return;
        }
        const wsParams = this.wavesurfer.params;
        const fontSize = this.params.fontSize * wsParams.pixelRatio;
        const totalSeconds = parseInt(duration, 10) + 1;
        const width =
            wsParams.fillParent && !wsParams.scrollParent
                ? this.drawer.getWidth()
                : this.drawer.wrapper.scrollWidth * wsParams.pixelRatio;
        const height1 = this.params.height * this.pixelRatio;
        const height2 =
            this.params.height *
            (this.params.notchPercentHeight / 100) *
            this.pixelRatio;
        const pixelsPerSecond = width / duration;

        const formatLabel = this.params.formatLabelCallback;
        const measureLabelTimes = this.params.measureLabelTimes();
        const beatLabelTimes = this.params.beatLabelTimes();

        let curPixel1 = pixelsPerSecond * this.params.offset;
        let ii;
        // build an array of index, second, and pixel data
        const positioning1 = [];
        for (ii = 0; ii < measureLabelTimes.length; ii++){
            curPixel1 = pixelsPerSecond * measureLabelTimes[ii];
            positioning1.push([ii, measureLabelTimes[ii], curPixel1]);
        }

        // iterate over each position
        const renderPositions1 = cb => {
            positioning1.forEach(pos => {
                cb(pos[0], pos[1], pos[2]);
            });
        };

        let curPixel2 = pixelsPerSecond * this.params.offset;
        let iii;
        // build an array of index, second, and pixel data
        const positioning2 = [];
        for (iii = 0; iii < beatLabelTimes.length; iii++){
            curPixel2 = pixelsPerSecond * beatLabelTimes[iii];
            positioning2.push([iii, beatLabelTimes[iii], curPixel2]);
        }

        // iterate over each position
        const renderPositions2 = cb => {
            positioning2.forEach(pos => {
                cb(pos[0], pos[1], pos[2]);
            });
        };

        // render beat labels
        this.setFillStyles(this.params.secondaryColor);
        this.setFonts(`${fontSize}px ${this.params.fontFamily}`);
        this.setFillStyles(this.params.secondaryFontColor);
        renderPositions2((iii, beatLabelTimes, curPixel2) => {
            this.fillRect(curPixel2, 2, 1, height2);
            this.fillText(
                formatLabel(beatLabelTimes, pixelsPerSecond, iii),
                curPixel2 + this.params.labelPadding * this.pixelRatio,
                height2 / 2
            );
        });

        // render measure labels
        this.setFillStyles(this.params.primaryColor);
        this.setFonts(`${fontSize}px ${this.params.fontFamily}`);
        this.setFillStyles(this.params.primaryFontColor);
        renderPositions1((ii, measureLabelTimes, curPixel1) => {
            this.fillRect(curPixel1, 2, 1, height1);
            this.fillText(
                formatLabel(measureLabelTimes, pixelsPerSecond, ii),
                curPixel1 + this.params.labelPadding * this.pixelRatio,
                height1
            );
        });
    }

    /**
     * Set the canvas fill style
     *
     * @param {DOMString|CanvasGradient|CanvasPattern} fillStyle Fill style to
     * use
     */
    setFillStyles(fillStyle) {
        this.canvascontexts.forEach(context => {
            context.fillStyle = fillStyle;
        });
    }

    /**
     * Set the canvas font
     *
     * @param {DOMString} font Font to use
     */
    setFonts(font) {
        this.canvascontexts.forEach(context => {
            context.font = font;
        });
    }

    /**
     * Draw a rectangle on the canvases
     *
     * (it figures out the offset for each canvas)
     *
     * @param {number} x X-position
     * @param {number} y Y-position
     * @param {number} width Width
     * @param {number} height Height
     */
    fillRect(x, y, width, height) {
        this.canvases.forEach((canvas, i) => {
            const leftOffset = i * this.maxCanvasWidth;

            const intersection = {
                x1: Math.max(x, i * this.maxCanvasWidth),
                y1: y,
                x2: Math.min(x + width, i * this.maxCanvasWidth + canvas.width),
                y2: y + height
            };

            if (intersection.x1 < intersection.x2) {
                this.canvascontexts[i]
                    .fillRect(
                        intersection.x1 - leftOffset,
                        intersection.y1,
                        intersection.x2 - intersection.x1,
                        intersection.y2 - intersection.y1
                    );
            }
        });
    }

    /**
     * Fill a given text on the canvases
     *
     * @param {string} text Text to render
     * @param {number} x X-position
     * @param {number} y Y-position
     */
    fillText(text, x, y) {
        let textWidth = 30;
        let xOffset = 0;

        this.canvascontexts.forEach(context => {
            const canvasWidth = context.canvas.width;

            if (xOffset > x + textWidth) {
                return;
            }

            if (xOffset + canvasWidth > x) {
                context.fillText(text, x - xOffset, y);
            }

            xOffset += canvasWidth;
        });
    }

    /**
     * Turn the time into a suitable label for the time.
     *
     * @param {number} seconds Seconds to format
     * @param {number} pxPerSec Pixels per second
     * @param {number} index Index of label
     * @returns {number} Time
     */
    defaultFormatLabelCallback(seconds, pxPerSec, index) {
        return index + 1;
    }

    /**
     * Return a default set of notches to plot for measures.
     *
     * @returns {number} array
     */
    defaultMeasureLabelTimes(){
        return ([0, 1]);
    }

    /**
     * Return a default set of notches to plot for beats.
     *
     * @returns {number} array
     */
    defaultBeatLabelTimes(){
        return ([0, 1, 2, 3]);
    }
}
