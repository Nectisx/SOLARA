import { EmbedBuilder } from 'discord.js';
import { getTicketData, saveTicketData } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { getGuildConfig } from '../../services/guildConfig.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Médiocre',
    '2': '⭐⭐ 2 — En dessous de la moyenne',
    '3': '⭐⭐⭐ 3 — Moyen',
    '4': '⭐⭐⭐⭐ 4 — Bien',
    '5': '⭐⭐⭐⭐⭐ 5 — Excellent',
};

const feedbackHandler = {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {
        // args = [guildId, channelId, rating]
        const [guildId, channelId, ratingStr] = args;

        if (!guildId || !channelId || !ratingStr) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Lien d\'avis invalide')
                        .setDescription('Ce lien d\'avis semble être malformé.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ticket introuvable')
                        .setDescription('Impossible de trouver le ticket associé à cette enquête.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Non autorisé')
                        .setDescription('Seul le créateur du ticket peut soumettre un avis pour ce ticket.')
                        .setColor(getColor('error')),
                ],
                ephemeral: true,
            });
            return;
        }

        if (ticketData.feedback?.rating) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Déjà soumis')
                        .setDescription(`Vous avez déjà noté ce ticket **${STAR_LABELS[String(ticketData.feedback.rating)]}**.\nMerci pour votre avis !`)
                        .setColor(getColor('success')),
                ],
                components: [],
            });
            return;
        }

        const rating = parseInt(ratingStr, 10);
        const ratingLabel = STAR_LABELS[String(rating)] ?? `${rating} stars`;

        try {
            ticketData.feedback = {
                rating,
                submittedAt: new Date().toISOString(),
            };
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedback: failed to save feedback', { guildId, channelId, rating, error: err.message });
        }

        // Send feedback to logs channel
        try {
            const guildConfig = await getGuildConfig(interaction.client, guildId);
            if (guildConfig.ticketLogsChannelId) {
                const logsChannel = await interaction.client.channels.fetch(guildConfig.ticketLogsChannelId).catch(() => null);
                if (logsChannel && logsChannel.isSendable()) {
                    const feedbackEmbed = new EmbedBuilder()
                        .setTitle('📋 Avis de ticket reçu')
                        .setDescription('L\'utilisateur a soumis un avis pour un ticket')
                        .setColor(getColor('info'))
                        .addFields(
                            { name: 'ID du ticket', value: `\`${channelId}\``, inline: true },
                            { name: 'Note', value: ratingLabel, inline: true },
                            { name: 'Utilisateur', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Soumis', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                        )
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .setFooter({ text: `User ID: ${interaction.user.id}` })
                        .setTimestamp();

                    await logsChannel.send({ embeds: [feedbackEmbed] });
                }
            }
        } catch (err) {
            logger.warn('ticketFeedback: failed to send log', { guildId, channelId, error: err.message });
        }

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Merci pour votre avis !')
                    .setDescription(`Vous avez noté votre expérience d'assistance **${ratingLabel}**.\n\nVotre avis a été enregistré et nous aide à nous améliorer !`)
                    .setColor(getColor('success'))
                    .setFooter({ text: 'Merci d\'utiliser notre système d\'assistance.' })
                    .setTimestamp(),
            ],
            components: [],
        });

        logger.info('Ticket feedback submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
            rating,
        });
    },
};

const declineHandler = {
    name: 'ticket_feedback_decline',

    async execute(interaction) {
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('👋 Pas de problème !')
                    .setDescription('Vous pouvez toujours nous contacter si vous avez besoin d\'une aide supplémentaire.')
                    .setColor(getColor('default')),
            ],
            components: [],
        });
    },
};

export default [feedbackHandler, declineHandler];
