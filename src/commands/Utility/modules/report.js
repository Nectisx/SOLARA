import { getColor } from '../../../config/bot.js';
import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Report interaction defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const guildId = interaction.guildId;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportChannelId = guildConfig.reportChannelId;

        if (!reportChannelId) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Configuration requise', 'Le salon de signalement n\'a pas été configuré. Demandez à un modérateur d\'utiliser `/report setchannel` d\'abord.')],
            });
        }

        const reportChannel = interaction.guild.channels.cache.get(reportChannelId);
        if (!reportChannel) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Salon introuvable', 'Le salon de signalement configuré est manquant ou inaccessible. Demandez à un modérateur de le reconfigurer.')],
            });
        }

        try {
            const reportEmbed = createEmbed({
                title: `🚨 NOUVEAU SIGNALEMENT : ${targetUser.tag}`,
                description: `**Signalé par :** ${interaction.user.tag} (\`${interaction.user.id}\`)\n**Utilisateur signalé :** ${targetUser.tag} (\`${targetUser.id}\`)`,
            })
                .setColor(getColor('error'))
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Signalé dans le salon', value: interaction.channel.toString(), inline: true },
                    { name: 'Heure', value: new Date().toUTCString(), inline: true },
                );

            await reportChannel.send({
                content: `<@&${interaction.guild.ownerId}> Nouveau signalement !`,
                embeds: [reportEmbed],
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({ title: '✅ Signalement envoyé', description: `Votre signalement concernant **${targetUser.tag}** a bien été transmis à l'équipe de modération. Merci !` })],
            });

            logger.info('Report submitted', {
                userId: interaction.user.id,
                reportedUserId: targetUser.id,
                guildId,
                reasonLength: reason.length,
            });
        } catch (error) {
            logger.error('report error:', error);
            await handleInteractionError(interaction, error, { commandName: 'report', source: 'report' });
        }
    },
};
