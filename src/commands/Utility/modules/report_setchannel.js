import { PermissionsBitField, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Permission refusée', 'Vous avez besoin des permissions **Gérer le serveur** pour définir le salon de signalement.')],
                ephemeral: true,
            });
        }

        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guildId;

        try {
            const guildConfig = await getGuildConfig(client, guildId);
            guildConfig.reportChannelId = channel.id;
            await setGuildConfig(client, guildId, guildConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('✅ Salon de signalement défini', `Tous les nouveaux signalements seront désormais envoyés dans ${channel}.`)],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('report_setchannel error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Erreur base de données', 'Impossible d\'enregistrer la configuration du salon.')],
                ephemeral: true,
            });
        }
    },
};
