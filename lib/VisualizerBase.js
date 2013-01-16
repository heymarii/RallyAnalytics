// Generated by CoffeeScript 1.3.3

/*
The general structure of an incrementally update-able visualization follows these steps:

1. Gather the parameters you'll need to specify the visualization
   a. Gather some info from Rally's standard WSAPI
   b. Gather some info from the user.

2. Create a hash from info from above to be used as the key for cache lookup.

3. Restore the cached calculation using LocalCache.

4. Render the cached calculation. Leave space for updates on the x-axis. Show spinners for missing parts.

5. Query the Lookback API for the incremental "snapshots" not found in the cache.
   Get one page's worth of updates. Maybe 10,000 snapshots max?

6. Update the calculation/manipulation/aggregation of the snapshot data.

7. Update the chart.

8. If there are still more pages of snapshots to update repeat starting at step 5.
*/


(function() {
  var Time, VisualizerBase, lumenize, utils,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __slice = [].slice;

  if (typeof exports !== "undefined" && exports !== null) {
    lumenize = require('../lib/Lumenize');
  } else {
    lumenize = require('/lumenize');
  }

  utils = lumenize.utils, Time = lumenize.Time;

  VisualizerBase = (function() {
    /*
      @class ChartVisualizerBase
        This is intended to the be the base class for ChartVisualizers. It assumes a template method pattern where the parts
        of the algorithm that have to do with saving to and restoring from the LocalCache (using localStorage API) and
        providing events for config changes or data updates.
    
        You must override these methods:
          * initialize() - set @LumenizeCalculatorClass (implements Lumenize.iCalculator)
    
        You may wish to override:
          * deriveFields(snapshots)
    
      @cfg {Number} [refreshIntervalMilliseconds = 30 * 60 * 1000] Defaults to 30 minutes
    
      @property {Object} userConfig This is whatever the users passes in under the @userConfig parameter in the constructor. It is useful for creating the cache hash. The contents of this will be visualizer specific
    
      @property {Object} config Starts with all the values in userConfig but more may be added
      @property {Number} [config.refreshIntervalMilliseconds = 5 * 60 * 1000] The chart will automatically refresh after this many milliseconds
      @property {Object} [config.deriveFieldsConfig] If you include this, it will pass it into Lumenize.deriveFields as the config Object every time it gets new snapshots to process.
      @property {Boolean} [config.debug = false]
      @property {Object} config.lumenizeCalculatorConfig The config that will be passed to the Lumenize calculator upon instantiation. Do not put x-axis range info in here.
    
      @property {Object} projectAndWorkspaceScope
      @property {Number} projectAndWorkspaceScope.workspaceOID
      @property {Boolean} projectAndWorkspaceScope.projectScopingUp
      @property {Boolean} projectAndWorkspaceScope.projectScopingDown
      @property {Number} projectAndWorkspaceScope.projectOID
    
      @property {Object} workspaceConfiguration Has whatever fields come from Rally but WorkDays and TimeZone (note Caps) are often used by calculators
    
      @property {Lumenize.iCalculator} LumenizeCalculatorClass Must be set; typically in your initialize() method
    
      @property {Object} visualizationData This is where you store the data that you want to communicate to your visualizations.
        It will be passed into createVisualizationCB.
    
      @property {iAnalyticsQuery} analyticsQuery Instantiate this in your onNewDataAvailable() method.
    
      @property {String} upToDateISOString A ISOString (e.g. '2012-01-01T12:34:56.789Z') indicating the last moment that this chart is
        up to date. You should not set this but you can read from it. It will be set when new snapshots are added or it's
        restored from the cache.
      @readonly
    */

    /*
      Sequence diagram below can be edited here: http://www.asciiflow.com/#Draw2041780197906655348/1887977824
      +----------------------+ +-----------------------+ +---------------------+ +------------------+ +-------------------+ +-----------------------+ +-------------------+ +---------------------+ +---------------+
      |initialize and before | |onConfigOrScopeUpdated | |createVisualization  | |onNewDataAvailable| |onSnapshotsReceived| |deriveFieldsOnSnapshots| |updateCalculator   | |updateVisualization  | |newDataExpected|
      |----------------------| |-----------------------| |---------------------| |------------------| |-------------------| |-----------------------| |-------------------| |---------------------| |---------------|
      |@userConfig           | |@lumenizeCalculator    | |@visualizationData   | |@upToDateISOString| |@upToDateISOString | |snapshots              | |@lumenizeCalculator| |@visualizationData   | |               |
      |@config               | |@upToDateISOString     | | via call to         | | = '2011-12-01...'| | = endBefore       | |                       | |@cache             | | via call to         | |               |
      |@cache                | | (null if not restored)| | @updateVisualizatio-| | if null          | |                   | |                       | |                   | | @updateVisualizatio-| |               |
      |@createVisualizationCB| |                       | | nData()             | |@analyticsQuery   | |                   | |                       | |                   | | nData()             | |               |
      +----------------------+ +-----------------------+ +---------------------+ +------------------+ +-------------------+ +-----------------------+ +-------------------+ +-----------+---------+ +---------------+
             |                            |                           |                  |                      |                       |                     |                        |                    |
             +--------------------------->|                           |                  |                      |                       |                     |                        |                    |
             |                            +-------------------------->|                  |                      |                       |                     |                        |                    |
             |                            |                           +----------------->|                      |                       |                     |                        |                    |
             |                            |                           |                  +--------------------->|                       |                     |                        |                    |
             |                            |                           |                  |                      +---------------------->|                     |                        |                    |
             |                            |                           |                  |                      |                       +-------------------->|                        |                    |
             |                            |                           |                  |                      |                       |                     +----------------------->|                    |
             |                            |                           |                  |                      |                       |                     |                        +------------------->|
             |                            |                           |                  |                      |                       |                     |                        |                    |
             |                            |                           |                  |<----------------------------- @timeoutHandle = setTimeout(@onNewDataAvailable, delay) ---------------------------+<-+
             |                            |                           |                  |                      |                       |                     |                        |                    |  |
             |                            |                           |                  +--------------------->|                       |                     |                        |                    |  |
             |                            |                           |                  |                      +---------------------->|                     |                        |                    |  |
             |                            |                           |                  |                      |                       +-------------------->|                        |                    |  |
             |                            |                           |                  |                      |                       |                     +----------------------->|                    |  |
             |                            |                           |                  |                      |                       |                     |                        +------------------->+--+
             |                            |                           |                  |                      |                       |                     |                        |                    |
    */

    function VisualizerBase(visualizations, userConfig, createVisualizationCB) {
      this.visualizations = visualizations;
      this.userConfig = userConfig;
      this.createVisualizationCB = createVisualizationCB;
      this.onSnapshotsReceieved = __bind(this.onSnapshotsReceieved, this);

      /*
          You should not have a constructor for the sub-class. Rather, put your code in initialize(). If for some crazy
          reason you really want a constructor, make sure it looks like this:
          ```
          constructor: (myCustomArgument, remainingArguments...) ->
            # Any code you want to execute before initialize(). Use myCustomArgument.
            super(remainingArguments...)
            # Any code you want to execute after initialize(). Use myCustomArgument.
          ```
      */

      this.config = utils.clone(this.userConfig);
      if (this.config.trace) {
        console.log('in VisualizerBase.constructor');
      }
      this.cache = new LocalCache();
      if (this.config.debug == null) {
        this.config.debug = false;
      }
      this.getProjectAndWorkspaceScope();
    }

    VisualizerBase.prototype.getProjectAndWorkspaceScope = function() {
      var projectOID, projectScopingDown, projectScopingUp, scope, workspaceOID, _callback,
        _this = this;
      if (this.config.trace) {
        console.log('in VisualizerBase.getProjectAndWorkspaceScope');
      }
      if (top === self) {
        workspaceOID = 41529001;
        projectScopingUp = false;
        projectScopingDown = true;
        projectOID = 81147451;
      } else {
        workspaceOID = __WORKSPACE_OID__;
        projectScopingUp = __PROJECT_SCOPING_UP__;
        projectScopingDown = __PROJECT_SCOPING_DOWN__;
        projectOID = __PROJECT_OID__;
      }
      scope = {
        workspaceOID: workspaceOID,
        projectScopingUp: projectScopingUp,
        projectScopingDown: projectScopingDown,
        projectOID: projectOID
      };
      _callback = function(projectAndWorkspaceScope) {
        _this.projectAndWorkspaceScope = projectAndWorkspaceScope;
        return _this.getWorkspaceConfiguration();
      };
      return _callback(scope);
    };

    VisualizerBase.prototype.getWorkspaceConfiguration = function() {
      var workspaceConfiguration, _callback,
        _this = this;
      if (this.config.trace) {
        console.log('in VisualizerBase.getWorkspaceConfiguration');
      }
      workspaceConfiguration = {
        DateFormat: 'MM/dd/yyyy',
        DateTimeFormat: 'MM/dd/yyyy hh:mm:ss a',
        IterationEstimateUnitName: 'Points',
        ReleaseEstimateUnitName: 'Points',
        TaskUnitName: 'Hours',
        TimeTrackerEnabled: true,
        TimeZone: 'America/Denver',
        WorkDays: 'Monday,Tuesday,Wednesday,Thursday,Friday'
      };
      _callback = function(workspaceConfiguration) {
        _this.workspaceConfiguration = workspaceConfiguration;
        _this.initialize();
        return _this.onConfigOrScopeUpdated();
      };
      return _callback(workspaceConfiguration);
    };

    VisualizerBase.prototype.onConfigOrScopeUpdated = function() {
      var savedState;
      if (this.config.trace) {
        console.log('in VisualizerBase.onConfigOrScopeUpdated');
      }
      savedState = this.cache.getItem(this.getHashForCache());
      if (savedState != null) {
        this.lumenizeCalculator = this.LumenizeCalculatorClass.newFromSavedState(savedState);
        this.upToDateISOString = this.lumenizeCalculator.upToDateISOString;
      } else {
        this.lumenizeCalculator = new this.LumenizeCalculatorClass(this.config.lumenizeCalculatorConfig);
        this.upToDateISOString = null;
      }
      this.createVisualization();
      return this.onNewDataAvailable();
    };

    VisualizerBase.prototype.getAsOfISOString = function() {
      if (this.config.asOf != null) {
        return this.asOfISOString = new Time(this.config.asOf, 'millisecond').getISOStringInTZ(this.config.lumenizeCalculatorConfig.tz);
      } else {
        return this.asOfISOString = Time.getISOStringFromJSDate();
      }
    };

    VisualizerBase.prototype.onSnapshotsReceieved = function(snapshots, startOn, endBefore, queryInstance) {
      var asOfISOString;
      if (queryInstance == null) {
        queryInstance = null;
      }
      if (this.config.trace) {
        console.log('in VisualizerBase.onSnapshotsReceieved');
      }
      if (snapshots.length > 0) {
        this.dirty = true;
      } else {
        this.dirty = false;
      }
      this.upToDateISOString = endBefore;
      this.deriveFieldsOnSnapshots(snapshots);
      asOfISOString = this.getAsOfISOString();
      if (asOfISOString < endBefore) {
        endBefore = asOfISOString;
      }
      this.updateCalculator(snapshots, startOn, endBefore);
      this.updateVisualization();
      if (!((this.config.asOf != null) && this.upToDateISOString < this.config.asOf)) {
        if (this.analyticsQuery.hasMorePages()) {
          return this.onNewDataAvailable();
        } else {
          return this.newDataExpected(void 0, this.config.refreshIntervalMilliseconds);
        }
      }
    };

    VisualizerBase.prototype.newDataExpected = function(paddingDelay, etlDelay) {
      var delay;
      if (paddingDelay == null) {
        paddingDelay = 30 * 1000;
      }
      if (etlDelay == null) {
        etlDelay = 30 * 60 * 1000;
      }
      if (this.config.trace) {
        console.log('in VisualizerBase.newDataExpected');
      }
      delay = etlDelay + paddingDelay;
      if (this.timeoutHandle != null) {
        clearTimeout(this.timeoutHandle);
      }
      return this.timeoutHandle = setTimeout(this.onNewDataAvailable, delay);
    };

    VisualizerBase.prototype.removeFromCacheAndRecalculate = function() {
      if (this.config.trace) {
        console.log('in VisualizerBase.removeFromCacheAndRecalculate');
      }
      this.upToDateISOString = null;
      this.cache.removeItem(this.getHashForCache());
      return this.onConfigOrScopeUpdated();
    };

    VisualizerBase.prototype.updateCalculator = function() {
      var endBefore, rest, savedState, snapshots, startOn, _ref;
      snapshots = arguments[0], startOn = arguments[1], endBefore = arguments[2], rest = 4 <= arguments.length ? __slice.call(arguments, 3) : [];
      /*
          @method updateCalculator
            Allows you to incrementally add snapshots to this calculator. It will also update the cache.
          @param {Object[]} snapshots An array of temporal data model snapshots.
          @param {String} startOn A ISOString (e.g. '2012-01-01T12:34:56.789Z') indicating the time start of the period of
            interest. On the second through nth call, this must equal the previous endBefore.
          @param {String} endBefore A ISOString (e.g. '2012-01-01T12:34:56.789Z') indicating the moment just past the time
            period of interest. This should be the ETLDate from the results of your query to the Lookback API.
      */

      if (this.config.trace) {
        console.log('in VisualizerBase.updateCalculator');
      }
      (_ref = this.lumenizeCalculator).addSnapshots.apply(_ref, [snapshots, startOn, endBefore].concat(__slice.call(rest)));
      savedState = this.lumenizeCalculator.getStateForSaving();
      return this.cache.setItem(this.getHashForCache(), savedState);
    };

    VisualizerBase.prototype.initialize = function() {
      if (this.config.trace) {
        console.log('in VisualizerBase.initialize');
      }
      if (this.config.lumenizeCalculatorConfig == null) {
        this.config.lumenizeCalculatorConfig = {};
      }
      this.config.lumenizeCalculatorConfig.workDays = this.workspaceConfiguration.WorkDays;
      if (this.userConfig.tz != null) {
        return this.config.lumenizeCalculatorConfig.tz = this.userConfig.tz;
      } else {
        this.config.tz = this.workspaceConfiguration.TimeZone;
        return this.config.lumenizeCalculatorConfig.tz = this.workspaceConfiguration.TimeZone;
      }
    };

    VisualizerBase.prototype.deriveFieldsOnSnapshots = function(snapshots) {
      if (this.config.trace) {
        console.log('in VisualizerBase.deriveFieldsOnSnapshots');
      }
      if (this.config.deriveFieldsOnSnapshotsConfig != null) {
        return Lumenize.deriveFields(snapshots, this.config.deriveFieldsOnSnapshotsConfig);
      }
    };

    VisualizerBase.prototype.createVisualization = function() {
      if (this.config.trace) {
        console.log('in VisualizerBase.createVisualization');
      }
      this.updateVisualizationData();
      return this.createVisualizationCB(this.visualizationData);
    };

    VisualizerBase.prototype.updateVisualization = function() {
      if (this.config.trace) {
        console.log('in VisualizerBase.updateVisualization');
      }
      this.updateVisualizationData();
      return this.createVisualizationCB(this.visualizationData);
    };

    VisualizerBase.prototype.onNewDataAvailable = function() {
      if (this.config.trace) {
        console.log('in VisualizerBase.onNewDataAvailable');
      }
      return this.analyticsQuery.getPage(this.onSnapshotsReceieved);
    };

    VisualizerBase.prototype.updateVisualizationData = function() {
      if (this.config.trace) {
        return console.log('in VisualizerBase.updateVisualizationData');
      }
    };

    VisualizerBase.prototype.getHashForCache = function() {
      if (this.config.trace) {
        return console.log('in VisualizerBase.getHashForCache');
      }
    };

    return VisualizerBase;

  })();

  this.VisualizerBase = VisualizerBase;

}).call(this);