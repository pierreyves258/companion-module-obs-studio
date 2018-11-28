var instance_skel = require('../../instance_skel');
const OBSWebSocket = require('obs-websocket-js');
var debug;
var log;

function instance(system, id, config) {
	var self = this;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions();

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	debug("updateConfig() destroying and reiniting..");
	self.destroy();
	self.init();
};

instance.prototype.init = function() {
	var self = this;

	self.status(self.STATE_ERROR);
	if (self.obs !== undefined) {
		self.obs.disconnect();
		self.obs = undefined;
	}
	self.obs = new OBSWebSocket();
	self.states = {};
	self.scenes = {};
	self.active_scene = "";

	self.obs.connect({
		address: (self.config.host !== '' ? self.config.host : '127.0.0.1') + ':' + (self.config.port !== '' ? self.config.port : '4444'),
		password: self.config.pass
	}).then(() => {
		self.status(self.STATE_OK);
		debug('Success! Connected.');
		self.updateScenes();
	}).catch(err => {
		self.status(self.STATE_ERROR,err);
	});

	self.obs.on('TransitionBegin', function(data) {
		console.log("transitionbegin", data);
	});

	self.obs.on('SwitchScenes', function(data) {
		console.log("switchscenes", data);
		self.states['scene_active'] = data['scene-name'];
		self.setVariable('scene_active', data['scene-name']);
		self.checkFeedbacks('scene_active');
	});

	self.obs.on('ScenesChanged', function() {
		self.updateScenes();
	});

	self.obs.on('StreamStarted', function(data) {
		self.process_stream_vars(data);
		self.checkFeedbacks('streaming');
	});

	self.obs.on('StreamStopped', function() {
		self.setVariable('streaming', false);
		self.states['streaming'] = false;
		self.checkFeedbacks('streaming');
	});

	self.obs.on('StreamStatus', function(data) {
		self.process_stream_vars(data);
	});

	debug = self.debug;
	log = self.log;
};
instance.prototype.process_stream_vars = function(data) {

	var self = this;

	for (var s in data) {
		self.states[s] = data[s];
	}

	self.setVariable('bytes_per_sec', data['bytes-per-sec']);
	self.setVariable('fps', data['fps']);
	self.setVariable('kbits_per_sec', data['kbits-per-sec']);
	self.setVariable('num_dropped_frames', data['num-dropped-frames']);
	self.setVariable('num_total_frames', data['num-dropped-frames']);
	self.setVariable('preview_only', data['preview-only']);
	self.setVariable('recording', data['recording']);
	self.setVariable('strain', data['strain']);
	self.setVariable('stream_timecode', data['stream-timecode']);
	self.setVariable('streaming', data['streaming']);
	self.setVariable('total_stream_time', data['total-stream-time']);

	self.checkFeedbacks('streaming');

};


// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 8,
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'Target Port',
			width: 4,
			default: 4444,
			regex: self.REGEX_PORT
		},
		{
			type: 'textinput',
			id: 'pass',
			label: 'Password',
			width: 4,
		}
	]
};

instance.prototype.updateScenes = function() {
	var self = this;
	console.log("updateScenes()");

	self.obs.getSceneList().then(data => {
		self.scenes = {};
		self.active_scene = "";
		for (var s in data.scenes) {
			var scene = data.scenes[s];
			self.scenes[scene.name] = scene;
		}
		self.actions();
		self.init_presets();
		self.init_feedbacks();
		self.init_variables();
	});

};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	self.scenes = [];
	self.states = {};
	self.scenelist = [];
	self.active_scene = "";
	self.obs.disconnect();
	debug("destroy");
};

instance.prototype.actions = function() {
	var self = this;
	console.log("actions", self.scenes);
	self.scenelist = [];
	if (self.scenes !== undefined) {
		for (var s in self.scenes) {
			self.scenelist.push({ id: s, label: s });
		}
	}

	self.system.emit('instance_actions', self.id, {

		'set_scene': {
			label: 'Change scene',
			options: [
				{
					type: 'dropdown',
					label: 'Scene',
					id: 'scene',
					default: '0',
					choices: self.scenelist
				}
			]
		},
		'set_preview': {
			label: 'Change preview',
			options: [
				{
					type: 'dropdown',
					label: 'Preview',
					id: 'preview',
					default: '0',
					choices: self.scenelist
				}
			]
		}
	});
}

instance.prototype.action = function(action) {
	var self = this;

	debug('action: ', action);

	if (action.action == 'set_scene') {
		self.obs.setCurrentScene({
			'scene-name': action.options.scene
		});
	}

	if (action.action == 'set_preview') {
		self.obs.setPreviewScene({
			'scene-name': action.options.preview
		});
	}

};




instance.prototype.init_feedbacks = function() {
	var self = this;

	// feedbacks
	var feedbacks = {};

	feedbacks['streaming'] = {
		label: 'Stream is running',
		description: 'If the stream is running, change colors of the bank',
		options: [
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(100,255,0)
			},
		]
	};


	feedbacks['scene_active'] = {
		label: 'Change colors from active scene',
		description: 'If the scene specified is active in OBS, change colors of the bank',
		options: [
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(0,255,0)
			},
			{
				 type: 'dropdown',
				 label: 'Scene',
				 id: 'scene',
				 default: '',
				 choices: self.scenelist
			}
		]
	};

	feedbacks['preview_active'] = {
		label: 'Change colors from active preview',
		description: 'If the preview specified is active in OBS, change colors of the bank',
		options: [
			{
				type: 'colorpicker',
				label: 'Foreground color',
				id: 'fg',
				default: self.rgb(255,255,255)
			},
			{
				type: 'colorpicker',
				label: 'Background color',
				id: 'bg',
				default: self.rgb(0,255,0)
			},
			{
				 type: 'dropdown',
				 label: 'Scene',
				 id: 'preview',
				 default: '',
				 choices: self.scenelist
			}
		]
	};

	self.setFeedbackDefinitions(feedbacks);
};

instance.prototype.feedback = function(feedback, bank) {
	var self = this;

	if (feedback.type == 'scene_active') {
		if (self.states['scene_active'] == feedback.options.scene) {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg };
		}
	}

	if (feedback.type == 'preview_active') {
		if (self.states['preview_active'] == feedback.options.preview) {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg };
		}
	}

	if (feedback.type == 'streaming') {
		if (self.states['streaming'] === true) {
			return { color: feedback.options.fg, bgcolor: feedback.options.bg };
		}
	}

	return {};
};


instance.prototype.init_presets = function () {
	var self = this;
	var presets = [];

	for (var s in self.scenes) {
		var scene = self.scenes[s];

		presets.push({
			category: 'Scenes',
			label: scene.name,
			bank: {
				style: 'text',
				text: scene.name,
				size: 'auto',
				color: self.rgb(255,255,255),
				bgcolor: 0
			},
			feedbacks: [
				{
					type: 'scene_active',
					options: {
						bg: self.rgb(255,0,0),
						fg: self.rgb(255,255,255),
						scene: scene.name,
					},
					type: 'preview_active',
					options: {
						bg: self.rgb(255,0,0),
						fg: self.rgb(255,255,255),
						scene: preview.name,
					}
				}
			],
			actions: [
				{
					action: 'set_scene',
					options: {
						scene: scene.name
					},
					action: 'set_preview',
					options: {
						scene: preview.name
					}
				}
			]
		});
	}

	self.setPresetDefinitions(presets);
}


instance.prototype.init_variables = function() {
	var self = this;

	var variables = [];

	variables.push({ name: 'bytes_per_sec', label: 'Stream is active' });
	variables.push({ name: 'fps', label: 'Frames per second' });
	variables.push({ name: 'kbits_per_sec', label: 'kilobits per second' });
	variables.push({ name: 'num_dropped_frames', label: 'Number of dropped frames' });
	variables.push({ name: 'num_total_frames', label: 'Number of total frames' });
	variables.push({ name: 'preview_only', label: 'Preview only' });
	variables.push({ name: 'recording', label: 'Recording state' });
	variables.push({ name: 'strain', label: 'Strain' });
	variables.push({ name: 'stream_timecode', label: 'Stream Timecode' });
	variables.push({ name: 'streaming', label: 'Streaming State' });
	variables.push({ name: 'total_stream_time', label: 'Total streaming time' });

	self.setVariableDefinitions(variables);
};


instance_skel.extendedBy(instance);
exports = module.exports = instance;
