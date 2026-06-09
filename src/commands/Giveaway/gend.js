import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Termine immédiatement un concours actif et sélectionne le(s) gagnant(s).",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("L'ID du message du concours à terminer.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Giveaway command used outside guild',
                    ErrorTypes.VALIDATION,
                    'Cette commande ne peut être utilisée que dans un serveur.',
                    { userId: interaction.user.id }
                );
            }

            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                throw new TitanBotError(
                    'User lacks ManageGuild permission',
                    ErrorTypes.PERMISSION,
                    "Vous avez besoin de la permission 'Gérer le serveur' pour terminer un concours.",
                    { userId: interaction.user.id, guildId: interaction.guildId }
                );
            }

            logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

            const messageId = interaction.options.getString("messageid");

            
            if (!messageId || !/^\d+$/.test(messageId)) {
                throw new TitanBotError(
                    'Invalid message ID format',
                    ErrorTypes.VALIDATION,
                    'Veuillez fournir un ID de message valide.',
                    { providedId: messageId }
                );
            }

            const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
            const giveaway = giveaways.find(g => g.messageId === messageId);

            if (!giveaway) {
                throw new TitanBotError(
                    `Giveaway not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Aucun concours trouvé avec cet ID de message dans la base de données.",
                    { messageId, guildId: interaction.guildId }
                );
            }

            
            const endResult = await endGiveawayService(
                interaction.client,
                giveaway,
                interaction.guildId,
                interaction.user.id
            );

            const updatedGiveaway = endResult.giveaway;
            const winners = endResult.winners;

            
            const channel = await interaction.client.channels.fetch(
                updatedGiveaway.channelId,
            ).catch(err => {
                logger.warn(`Could not fetch channel ${updatedGiveaway.channelId}:`, err.message);
                return null;
            });

            if (!channel || !channel.isTextBased()) {
                throw new TitanBotError(
                    `Channel not found: ${updatedGiveaway.channelId}`,
                    ErrorTypes.VALIDATION,
                    "Impossible de trouver le salon où le concours était hébergé. L'état du concours a été mis à jour.",
                    { channelId: updatedGiveaway.channelId, messageId }
                );
            }

            const message = await channel.messages
                .fetch(messageId)
                .catch(err => {
                    logger.warn(`Could not fetch message ${messageId}:`, err.message);
                    return null;
                });

            if (!message) {
                throw new TitanBotError(
                    `Message not found: ${messageId}`,
                    ErrorTypes.VALIDATION,
                    "Impossible de trouver le message du concours. L'état du concours a été mis à jour.",
                    { messageId, channelId: updatedGiveaway.channelId }
                );
            }

            
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            
            const newEmbed = createGiveawayEmbed(updatedGiveaway, "ended", winners);
            const newRow = createGiveawayButtons(true);

            await message.edit({
                content: "🎉 **CONCOURS TERMINÉ** 🎉",
                embeds: [newEmbed],
                components: [newRow],
            });

            
            if (winners.length > 0) {
                const winnerMentions = winners
                    .map((id) => `<@${id}>`)
                    .join(", ");
                const winnerPingMsg = await channel.send({
                    content: `🎉 FÉLICITATIONS ${winnerMentions} ! Vous avez remporté le concours **${updatedGiveaway.prize}** ! Veuillez contacter l'hôte <@${updatedGiveaway.hostId}> pour réclamer votre prix.`,
                });
                updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;
                await saveGiveaway(interaction.client, interaction.guildId, updatedGiveaway);

                logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

                
                try {
                    await logEvent({
                        client: interaction.client,
                        guildId: interaction.guildId,
                        eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                        data: {
                            description: `Giveaway ended with ${winners.length} winner(s)`,
                            channelId: channel.id,
                            userId: interaction.user.id,
                            fields: [
                                {
                                    name: '🎁 Prize',
                                    value: updatedGiveaway.prize || 'Mystery Prize!',
                                    inline: true
                                },
                                {
                                    name: '🏆 Winners',
                                    value: winnerMentions,
                                    inline: false
                                },
                                {
                                    name: '👥 Entries',
                                    value: endResult.participantCount.toString(),
                                    inline: true
                                }
                            ]
                        }
                    });
                } catch (logError) {
                    logger.debug('Error logging giveaway winner event:', logError);
                }
            } else {
                await channel.send({
                    content: `Le concours pour **${updatedGiveaway.prize}** s'est terminé sans aucune participation valide.`,
                });
                logger.info(`Giveaway ended with no winners: ${messageId}`);
            }

            logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Concours terminé ✅",
                        `Le concours pour **${updatedGiveaway.prize}** dans ${channel} s'est terminé avec succès. ${winners.length} gagnant(s) sélectionné(s) parmi ${endResult.participantCount} participations.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'gend',
                context: 'giveaway_end'
            });
        }
    },
};



