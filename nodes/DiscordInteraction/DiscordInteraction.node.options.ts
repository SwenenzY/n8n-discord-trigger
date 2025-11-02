import { INodeProperties } from 'n8n-workflow';

export const options: INodeProperties[] = [
    {
        displayName: 'Type',
        name: 'type',

        type: 'options',
        options: [
            {
                name: 'Action',
                value: 'action',
                description: 'Instead of sending a message, it will perform an action defined in the next field',
            },
            {
                name: 'Message',
                value: 'message',
                description: 'This is the default type, it allows you to send a message without requiering any form of response',
            },
            {
                name: 'Confirmation',
                value: 'confirm',
                description: 'Let \'s the user decide whether to continue the interaction',
            },
        ],
        default: 'message',
        description: 'Let you choose the type of interaction you want to perform',
    },
    {
        displayName: 'Action',
        name: 'actionType',

        displayOptions: {
            show: {
                type: [ 'action' ],
            },
        },
        type: 'options',
        options: [
            {
                name: 'Get Messages',
                value: 'getMessages',
                description: 'Get messages from a channel',
            },
            {
                name: 'Remove Messages',
                value: 'removeMessages',
                description: 'Remove last messages from the "send to" channel',
            },
            {
                name: 'Add Role to User',
                value: 'addRole',
                description: 'Add a role to a user',
            },
            {
                name: 'Remove Role From User',
                value: 'removeRole',
                description: 'Remove a role from a user',
            },
        ],
        default: 'removeMessages',
        description: 'Let you choose the type of action you want to perform',
    },
    {
        displayName: 'Server Name or ID',
        name: 'guildIds',

        type: 'options',
        displayOptions: {
            show: {
                type: [ 'action', 'message', 'confirm' ],
            },
        },
        typeOptions: {
            loadOptionsMethod: 'getGuilds',
        },
        default: '',
        description: 'Let you specify the guild where you want the action to happen. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    },
    {
        displayName: 'Channel Name or ID',
        name: 'channelId',

        type: 'options',
        displayOptions: {
            show: {
                type: [ 'message', 'action', 'confirm' ],
            },
        },
        typeOptions: {
            loadOptionsDependsOn: [ 'guildIds' ],
            loadOptionsMethod: 'getChannels',
        },
        default: '',
        description: 'Let you specify the text channels where you want to send the message. Your credentials must be set and the bot running, you also need at least one text channel available. If you do not meet these requirements, make the changes then close and reopen the modal (the channels list is loaded when the modal opens). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    },
    {
        displayName: 'Message Limit',
        name: 'getMessagesLimit',
        type: 'number',
        required: true,
        displayOptions: {
            show: {
                type: [ 'action' ],
                actionType: [ 'getMessages' ],
            },
        },
        typeOptions: {
            maxValue: 100,
            minValue: 1,
        },
        default: 10,
        description: 'Number of messages to fetch (max 100)',
    },
    {
        displayName: 'How Many?',
        name: 'removeMessagesNumber',
        type: 'number',
        required: true,
        displayOptions: {
            show: {
                type: [ 'action' ],
                actionType: [ 'removeMessages' ],
            },
        },
        typeOptions: {
            maxValue: 100,
        },
        default: 1,
        description: 'Number of last messages to remove (Discord API allow max 150 and messages < 4 weeks old)',
    },
    {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        required: true,
        displayOptions: {
            show: {
                type: [ 'action' ],
                actionType: [ 'addRole', 'removeRole' ],
            },
        },
        default: '',
        description: 'The ID of the user you want to add or remove the role from',
    },
    {
        displayName: 'Which Role Names or IDs',
        name: 'roleUpdateIds',
        required: true,
        type: 'multiOptions',
        displayOptions: {
            show: {
                type: [ 'action' ],
                actionType: [ 'addRole', 'removeRole' ],
            },
        },
        typeOptions: {
            loadOptionsDependsOn: [ 'guildIds' ],
            loadOptionsMethod: 'getRoles',
        },
        default: [],
        description: 'Let you specify the roles you want to add or remove from the user. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    },
    {
        displayName: 'Content',
        name: 'content',
        type: 'string',
        displayOptions: {
            show: {
                type: [ 'message', 'confirm' ],
            },
        },
        typeOptions: {
            rows: 4,
        },
        default: '',
        description: 'Displayed text message. Cannot be empty when using button/select prompt.',
    },
    {
        displayName: 'Embed',
        name: 'embed',
        type: 'boolean',
        displayOptions: {
            show: {
                type: [ 'message', 'confirm' ],
            },
        },

        default: false,
        description: 'Whether you want to create an embed message rather than a regular content message',
    },
    {
        displayName: 'Color',
        name: 'color',
        type: 'color',
        default: '', // Initially selected color
        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
    },
    {
        displayName: 'Title',
        name: 'title',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
        default: '',

    },
    {
        displayName: 'URL',
        name: 'url',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
        default: '',

    },
    {
        displayName: 'Author Name',
        name: 'authorName',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
        default: '',

    },
    {
        displayName: 'Author Icon URL or Base64',
        name: 'authorIconUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
            hide: {
                authorName: [ '' ],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Author URL',
        name: 'authorUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
            hide: {
                authorName: [ '' ],
            },
        },
        default: '',

    },
    {
        displayName: 'Description',
        name: 'description',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
        default: '',

    },
    {
        displayName: 'Thumbnail URL or Base64',
        name: 'thumbnailUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Fields',
        name: 'fields',
        placeholder: 'Add Field',
        type: 'fixedCollection',
        typeOptions: {
            multipleValues: true,
        },
        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'action', 'confirm' ],
            },
        },

        default: {},
        options: [
            {
                name: 'field',
                displayName: 'Field',
                values: [
                    {
                        displayName: 'Title',
                        name: 'name',
                        type: 'string',
                        default: '',

                    },
                    {
                        displayName: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',

                    },
                    {
                        displayName: 'Inline',
                        name: 'inline',
                        type: 'boolean',

                        default: false,
                    },
                ],
            },
        ],
    },
    {
        displayName: 'Image URL or Base64',
        name: 'imageUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Footer Text',
        name: 'footerText',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
        default: '',

    },
    {
        displayName: 'Footer Icon URL or Base64',
        name: 'footerIconUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
            hide: {
                footerText: [ '' ],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Displayed Date',
        name: 'timestamp',
        type: 'dateTime',
        default: '',

        displayOptions: {
            show: {
                embed: [ true ],
                type: [ 'message', 'confirm' ],
            },
        },
    },
    {
        displayName: 'Files',
        name: 'files',
        placeholder: 'Add File',
        type: 'fixedCollection',
        typeOptions: {
            multipleValues: true,
        },
        displayOptions: {
            show: {
                type: [ 'message', 'confirm' ],
            },
        },
        description: 'Allows to attach up to 5 images to the message',
        default: {},
        options: [
            {
                name: 'file',
                displayName: 'File',
                values: [
                    {
                        displayName: 'URL or Base64',
                        name: 'url',
                        type: 'string',
                        default: '',
                        description: 'URL/base64 of the image to attach (png, jpg)',
                    },
                ],
            },
        ],
    },
    {
        displayName: 'Mention Role Names or IDs',
        name: 'mentionRoles',

        type: 'multiOptions',
        typeOptions: {
            loadOptionsMethod: 'getRoles',
        },
        displayOptions: {
            show: {
                type: [ 'message', 'confirm' ],
            },
        },
        default: [],
        description: 'Let you specify roles you want to mention in the message. Your credentials must be set and the bot running, you also need at least one role (apart from @everyone) available. If you do not meet these requirements, make the changes then close and reopen the modal. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    },
    {
        displayName: 'Additional Fields',
        name: 'additionalConfirmationFields',
        type: 'collection',
        default: {},
        placeholder: 'Add Field',
        displayOptions: {
            show: {
                type: [ 'confirm' ],
            },
        },
        options: [
            {
                displayName: 'Confirmation Timeout (in Seconds)',
                name: 'timeout',
                type: 'number',
                default: 60,
                description: "Timeout for the confirmation message. If the user does not respond within this time, the interaction will be considered as expired.",
            },
            {
                displayName: 'Yes Button Label',
                name: 'yesLabel',
                type: 'string',
                default: '',
                description: 'Optional custom label for the "Yes" button',
            },
            {
                displayName: 'No Button Label',
                name: 'noLabel',
                type: 'string',
                default: '',
                description: 'Optional custom label for the "No" button',
            },
        ],
    }
];
