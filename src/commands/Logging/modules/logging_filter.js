import { PermissionsBitField } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { logEvent } from '../../../utils/moderation.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Permission refusée', 'Vous avez besoin des permissions **Administrateur** pour gérer les filtres de logs.')],
            });
        }

        if (!client.db) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Erreur de base de données', 'Base de données non initialisée.')],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const type = interaction.options.getString('type');
        const entityId = interaction.options.getString('id');
        const guildId = interaction.guildId;

        const currentConfig = await getGuildConfig(client, guildId);
        if (!currentConfig.logIgnore) {
            currentConfig.logIgnore = { users: [], channels: [] };
        }

        let targetArray;
        let entityType;
        let entityName;

        if (type === 'user') {
            targetArray = currentConfig.logIgnore.users;
            entityType = 'Utilisateur';
            const member = await interaction.guild.members.fetch(entityId).catch(() => null);
            entityName = member ? member.user.tag : `ID: ${entityId}`;
        } else if (type === 'channel') {
            targetArray = currentConfig.logIgnore.channels;
            entityType = 'Salon';
            const channel = interaction.guild.channels.cache.get(entityId);
            entityName = channel ? `#${channel.name}` : `ID: ${entityId}`;
        } else {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Type invalide', "Choisissez `user` ou `channel`.")],
            });
        }

        let successMessage;

        if (subcommand === 'add') {
            if (targetArray.includes(entityId)) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Déjà filtré', `${entityType} **${entityName}** est déjà dans la liste d'exclusion.`)],
                });
            }
            targetArray.push(entityId);
            successMessage = `${entityType} **${entityName}** ajouté à la liste d'exclusion des logs. Les événements associés ne seront plus enregistrés.`;
        } else if (subcommand === 'remove') {
            const index = targetArray.indexOf(entityId);
            if (index === -1) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Non filtré', `${entityType} **${entityName}** n'était pas dans la liste d'exclusion.`)],
                });
            }
            targetArray.splice(index, 1);
            successMessage = `${entityType} **${entityName}** retiré de la liste d'exclusion des logs. Les événements seront désormais enregistrés.`;
        } else {
            return;
        }

        try {
            await setGuildConfig(client, guildId, currentConfig);

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Log Filter Updated',
                    target: `Filter ${subcommand}`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: { entityType, loggingEnabled: currentConfig.enableLogging },
                },
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('Filtre mis à jour', successMessage)],
            });
        } catch (error) {
            logger.error('logging filter error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Erreur de base de données', 'Impossible de sauvegarder la modification du filtre.')],
            });
        }
    },
};
