import { INodeProperties } from 'n8n-workflow';

export const options: INodeProperties[] = [
  {
    displayName: 'Voice Trigger Mode',
    name: 'voiceMode',
    type: 'options',
    options: [
      {
        name: 'Voice Activity',
        value: 'voice-activity',
        description: 'Trigger when someone starts/stops speaking',
      },
      {
        name: 'Voice Recording',
        value: 'voice-recording',
        description: 'Record voice audio and provide it as data',
      },
      {
        name: 'Join/Leave Channel',
        value: 'voice-state',
        description: 'Trigger when users join or leave voice channels',
      },
    ],
    default: 'voice-recording',
    description: 'Select how the voice trigger should work',
  },
  {
    displayName: 'Server Names or IDs',
    name: 'guildIds',
    placeholder: 'e.g. my-server',
    type: 'multiOptions',
    typeOptions: {
      loadOptionsMethod: 'getGuilds',
    },
    default: [],
    description: 'Select one or more Discord servers to monitor. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
  },
  {
    displayName: 'Voice Channel Names or IDs',
    name: 'voiceChannelIds',
    placeholder: 'e.g. my-voice-channel',
    type: 'multiOptions',
    typeOptions: {
      loadOptionsDependsOn: ['guildIds'],
      loadOptionsMethod: 'getVoiceChannels',
    },
    default: [],
    description: 'Select voice channels to monitor. If none selected, all voice channels will be monitored. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
  },
  {
    displayName: 'Recording Options',
    name: 'recordingOptions',
    type: 'collection',
    displayOptions: {
      show: {
        voiceMode: ['voice-recording'],
      },
    },
    default: {},
    placeholder: 'Add Option',
    options: [
      {
        displayName: 'Audio Format',
        name: 'audioFormat',
        type: 'options',
        options: [
          {
            name: 'OGG/Opus',
            value: 'ogg',
            description: 'Compressed audio format (recommended)',
          },
          {
            name: 'PCM Raw',
            value: 'pcm',
            description: 'Raw uncompressed audio data',
          },
          {
            name: 'WebM/Opus',
            value: 'webm',
            description: 'WebM container with Opus codec',
          },
        ],
        default: 'ogg',
        description: 'Audio format for the recording',
      },
      {
        displayName: 'Max Recording Duration (seconds)',
        name: 'maxDuration',
        type: 'number',
        default: 60,
        description: 'Maximum duration of a single recording in seconds',
        placeholder: '60',
      },
      {
        displayName: 'Silence Timeout (seconds)',
        name: 'silenceTimeout',
        type: 'number',
        default: 2,
        description: 'Stop recording after X seconds of silence',
        placeholder: '2',
      },
      {
        displayName: 'Record Multiple Speakers',
        name: 'multiSpeaker',
        type: 'boolean',
        default: false,
        description: 'Whether to record all speakers in the channel or just the triggering user',
      },
      {
        displayName: 'Minimum Speaking Duration (ms)',
        name: 'minSpeakingDuration',
        type: 'number',
        default: 100,
        description: 'Minimum duration of speech to trigger recording (in milliseconds)',
        placeholder: '100',
      },
    ],
  },
  {
    displayName: 'Transcription',
    name: 'transcription',
    type: 'collection',
    displayOptions: {
      show: {
        voiceMode: ['voice-recording'],
      },
    },
    default: {},
    placeholder: 'Add Option',
    options: [
      {
        displayName: 'Enable Transcription',
        name: 'enabled',
        type: 'boolean',
        default: false,
        description: 'Whether to transcribe the audio to text (requires external service)',
      },
      {
        displayName: 'Transcription Service',
        name: 'service',
        type: 'options',
        displayOptions: {
          show: {
            enabled: [true],
          },
        },
        options: [
          {
            name: 'OpenAI Whisper',
            value: 'whisper',
            description: 'Use OpenAI Whisper API for transcription',
          },
          {
            name: 'Google Speech-to-Text',
            value: 'google',
            description: 'Use Google Cloud Speech-to-Text',
          },
          {
            name: 'External Webhook',
            value: 'webhook',
            description: 'Send audio to external webhook for transcription',
          },
        ],
        default: 'whisper',
        description: 'Service to use for transcription',
      },
      {
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        displayOptions: {
          show: {
            enabled: [true],
            service: ['whisper', 'google'],
          },
        },
        default: '',
        description: 'API key for the transcription service',
        typeOptions: {
          password: true,
        },
      },
      {
        displayName: 'Webhook URL',
        name: 'webhookUrl',
        type: 'string',
        displayOptions: {
          show: {
            enabled: [true],
            service: ['webhook'],
          },
        },
        default: '',
        description: 'Webhook URL to send audio for transcription',
      },
      {
        displayName: 'Language',
        name: 'language',
        type: 'string',
        displayOptions: {
          show: {
            enabled: [true],
          },
        },
        default: 'en',
        description: 'Language code for transcription (e.g., en, es, fr, tr)',
        placeholder: 'en',
      },
    ],
  },
  {
    displayName: 'User Filters',
    name: 'userFilters',
    type: 'collection',
    default: {},
    placeholder: 'Add Filter',
    options: [
      {
        displayName: 'Listen to Roles',
        name: 'roleIds',
        placeholder: 'e.g. my-role',
        type: 'multiOptions',
        typeOptions: {
          loadOptionsDependsOn: ['guildIds'],
          loadOptionsMethod: 'getRoles',
        },
        default: [],
        description: 'Only trigger for users with these roles. If none selected, triggers for everyone. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Ignore Bots',
        name: 'ignoreBots',
        type: 'boolean',
        default: true,
        description: 'Whether to ignore bot users',
      },
      {
        displayName: 'Specific User IDs',
        name: 'userIds',
        type: 'string',
        default: '',
        description: 'Comma-separated list of user IDs to monitor (leave empty for all)',
        placeholder: 'e.g. 123456789,987654321',
      },
    ],
  },
  {
    displayName: 'Additional Options',
    name: 'additionalOptions',
    type: 'collection',
    default: {},
    placeholder: 'Add Option',
    options: [
      {
        displayName: 'Bot Auto-Join',
        name: 'autoJoin',
        type: 'boolean',
        default: true,
        description: 'Whether the bot should automatically join voice channels when users join',
      },
      {
        displayName: 'Bot Auto-Leave',
        name: 'autoLeave',
        type: 'boolean',
        default: true,
        description: 'Whether the bot should leave when the channel is empty',
      },
      {
        displayName: 'Debounce Time (ms)',
        name: 'debounceTime',
        type: 'number',
        default: 500,
        description: 'Time to wait before triggering after voice activity (in milliseconds)',
        placeholder: '500',
      },
      {
        displayName: 'Include User Metadata',
        name: 'includeMetadata',
        type: 'boolean',
        default: true,
        description: 'Whether to include user info, channel info, and timestamp in the output',
      },
      {
        displayName: 'Save Recording to File',
        name: 'saveToFile',
        type: 'boolean',
        displayOptions: {
          show: {
            '/voiceMode': ['voice-recording'],
          },
        },
        default: false,
        description: 'Whether to save recordings to local files',
      },
      {
        displayName: 'File Path',
        name: 'filePath',
        type: 'string',
        displayOptions: {
          show: {
            saveToFile: [true],
            '/voiceMode': ['voice-recording'],
          },
        },
        default: './recordings',
        description: 'Path where recordings should be saved',
        placeholder: './recordings',
      },
    ],
  },
];