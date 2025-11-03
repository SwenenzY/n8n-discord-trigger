# n8n-nodes-discord-trigger

![n8n.io - Workflow Automation](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png)

[n8n](https://www.n8n.io) nodes to trigger workflows from Discord messages.

This node utilizes a Discord bot to transmit or receive data from child processes when a node is executed. Fully updated and tested for 2025, with enhanced stability, cross-platform support, and advanced message handling features including debounce, cooldown, and multi-bot support.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Bot Setup](#bot-setup)  
[Operations](#operations)  
[Credentials](#credentials)  <!-- delete if no auth needed -->  
[Compatibility](#compatibility)  
[Usage](#usage)  <!-- delete if not using this section -->  
[Version history](#version-history)  <!-- delete if not using this section -->  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.


## Bot Setup

To send, listen to messages, or fetch the list of channels or roles, you need to set up a bot using the [Discord Developer Portal](https://discord.com/developers/applications).

1. Create a new application and set it up as a bot.
2. Enable the **Privileged Gateway Intents** for Message Intent.
3. Add the bot to your server with at least **read channel permissions**.



## Operations

With this node, you can:
- Listen to Discord chat messages (both server messages and direct messages).
- React to messages with specific patterns or triggers.
- Fetch lists of channels and roles.
- Use message debounce and cooldown features to control trigger frequency.
- Filter channels by category and manage disabled channels.
- Control channel status (lock, unlock, archive, unarchive).
- Send interactive confirmation messages with custom button labels.
- Track guild member updates and role changes.
- Handle multiple bot instances with multi-credential support.



## Credentials

You need to authenticate the node with the following credentials:
- **Client ID**: The OAuth2 client ID of the Discord App.
- **Bot Token**: The bot token of the Discord App.
- **n8n API Key**: The API key of your n8n server.
- **Base URL**: The API URL of your n8n instance (e.g., `https://n8n.example.com/api/v1`).

Refer to the [official n8n documentation](https://docs.n8n.io/) for more details.


## Compatibility

- Tested on n8n version 1.75.2
- Fully compatible with 2025 n8n versions
- Cross-platform support (Windows, Linux, macOS)


## Usage

To use this node:
1. Install it as a community node in your n8n instance.
2. Configure the required credentials.
3. Set up triggers for Discord messages based on your use case.

For more help on setting up n8n workflows, check the [Try it out documentation](https://docs.n8n.io/try-it-out/).


## Version history

- **v0.10.11**: Remove support command option and enhance support command handling in bot logic.
- **v0.10.10**: Implement client cleanup on restart and add global cleanup handlers for process termination.
- **v0.10.9**: Fix debounce and cooldown settings to use additionalFields for better organization.
- **v0.10.8**: Add message debounce and cooldown features for Discord trigger node to control message frequency.
- **v0.10.7**: Refactor DiscordTrigger cleanup to retain IPC connection for action nodes.
- **v0.10.6**: Enhance IPC handling with timeout, connection checks, and improved callback management.
- **v0.10.4**: Enhance IPC handling with timeout and improve message event structure.
- **v0.10.3**: Fix Promise handling in DiscordInteraction node.
- **v0.10.2**: Enhance DiscordInteraction to handle multiple messages and update bot action response logic.
- **v0.10.1**: Add channel status actions (lock, unlock, archive, unarchive).
- **v0.10.0**: Add support for category filtering and implement disabled channels management.
- **v0.8.3**: Fix bot startup logic for Unix systems and prevent multiple bot starts.
- **v0.8.2**: Add cross-platform IPC configuration for Windows, Linux, and macOS support.
- **v0.8.1**: Multiple bug fixes and stability improvements.
- **v0.8.0**: Add GuildMemberUpdate trigger, add option to rename confirm button choices.
- **v0.7.0**: Add multiclient support. Multiple credentials across multiple workflows are now possible.
- **v0.6.0**: Add direct message support (Thank you [Fank](https://github.com/Fank)).
- **v0.5.1**: Add additional timeout field for confirmation message.
- **v0.5.0**: Add a reaction trigger on messages, add attachments to message.
- **v0.4.0**: Introduce additional trigger options, such as User joins guild, User leaves guild, Role created, Role deleted or Role updated.
- **v0.3.2**: Update for multiple simultaneous trigger nodes with one bot.
- **v0.3.1**: Added additional option to trigger node to trigger on other bot messages.
- **v0.3.0**: Added option to require a reference message in order to trigger the node. Enhance interaction node with a confirmation node.
- **v0.2.9**: Bug fix, where a message won't trigger when multiple trigger nodes are included.
- **v0.2.8**: Multiple trigger nodes are now supported.
- **v0.2.7**: A second node Discord Interaction is added to send a message with the same credentials. Additionally roles of users can be added or removed based on interaction.
- **v0.1.5**: Initial release with message triggers and channel/role fetching capabilities.

