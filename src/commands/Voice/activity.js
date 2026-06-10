import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

const ACTIVITIES = {
    'youtube': '880218394199220334',
    'poker': '755827207812677713',
    'chess': '832012774040141894',
    'checkers': '832013003968348200',
    'letter-league': '879863686565621790',
    'spellcast': '852509694341283871',
    'sketch': '902271654783242291',
    'blazing8s': '832025144389533716',
    'puttparty': '945737671223947305',
    'landio': '903769130790969345',
    'bobble': '947957217959759964',
    'knowwhat': '976052223358406656'
};

const ACTIVITY_NAMES = {
    'youtube': 'YouTube Together',
    'poker': 'Poker Night',
    'chess': 'Chess in the Park',
    'checkers': 'Checkers in the Park',
    'letter-league': 'Letter League',
    'spellcast': 'SpellCast',
    'sketch': 'Sketch Heads',
    'blazing8s': 'Blazing 8s',
    'puttparty': 'Putt Party',
    'landio': 'Land-io',
    'bobble': 'Bobble League',
    'knowwhat': 'Know What I Mean'
};

export default {
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Démarrer une activité Discord dans votre salon vocal')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Connect)
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('youtube')
                .setDescription('Regarder des vidéos YouTube ensemble dans un salon vocal')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('poker')
                .setDescription('Jouer à Poker Night avec des amis')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('chess')
                .setDescription('Jouer aux échecs dans le parc')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('checkers')
                .setDescription('Jouer aux dames dans le parc')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('letter-league')
                .setDescription('Jouer au jeu de mots Letter League')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('spellcast')
                .setDescription('Jouer au jeu de mots magique SpellCast')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('sketch')
                .setDescription('Jouer à Sketch Heads (style Pictionary)')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('blazing8s')
                .setDescription('Jouer au jeu de cartes Blazing 8s')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('puttparty')
                .setDescription('Jouer à Putt Party (Mini-golf)')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('landio')
                .setDescription('Jouer au jeu de territoire Land-io')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('bobble')
                .setDescription('Jouer à Bobble League')
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('knowwhat')
                .setDescription('Jouer à Know What I Mean')
        ),

    category: "Voice",

    async execute(interaction, config, client) {
        try {
            
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const { member, options } = interaction;
            const activity = options.getSubcommand();
            const activityId = ACTIVITIES[activity];
            const activityName = ACTIVITY_NAMES[activity] || activity;

            if (!member.voice.channel) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Pas dans un salon vocal', 'Vous devez être dans un salon vocal pour démarrer une activité !')]
                });
            }

            logger.debug('Activity command - validating permissions', {
                userId: interaction.user.id,
                voiceChannelId: member.voice.channel.id,
                voiceChannelName: member.voice.channel.name,
                activity: activity
            });

            const permissions = member.voice.channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('CreateInstantInvite')) {
                logger.warn('Activity command - missing permissions', {
                    userId: interaction.user.id,
                    voiceChannelId: member.voice.channel.id,
                    guildId: interaction.guildId,
                    activity: activity,
                    missingPermission: 'CreateInstantInvite'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Permissions manquantes', 'J\'ai besoin de la permission `Créer une invitation` pour démarrer une activité !')]
                });
            }

            const invite = await interaction.client.rest.post(
                `/channels/${member.voice.channel.id}/invites`,
                {
                    body: {
                        max_age: 86400,
                        target_type: 2,
                        target_application_id: activityId,
                    },
                }
            );

            logger.info('Activity invite created successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                voiceChannelId: member.voice.channel.id,
                voiceChannelName: member.voice.channel.name,
                guildId: interaction.guildId,
                activity: activity,
                activityName: activityName,
                inviteCode: invite.code,
                commandName: 'activity'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: `🎮 ${activityName}`,
                    description: `Cliquez sur le lien ci-dessous pour démarrer **${activityName}** dans ${member.voice.channel.name} !\n\n[Rejoindre l'activité ${activityName}](https://discord.gg/${invite.code})`,
                    color: 'success'
                })]
            });

        } catch (error) {
            logger.error('Error creating activity invite', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                voiceChannelId: interaction.member?.voice.channel?.id,
                guildId: interaction.guildId,
                activity: options.getSubcommand(),
                commandName: 'activity'
            });
            
            if (!interaction.deferred && !interaction.replied) {
                await handleInteractionError(interaction, error, {
                    commandName: 'activity',
                    source: 'discord_activity_api'
                });
            } else {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Échec de création de l\'activité', 'Une erreur s\'est produite lors de la création de l\'activité. Veuillez réessayer plus tard.')]
                });
            }
        }
    },
};


