import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import setchannel from './modules/logging_setchannel.js';
import filter from './modules/logging_filter.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Gérer la journalisation d\'audit pour ce serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Ouvrir le tableau de bord interactif de journalisation — voir le statut et basculer les catégories d\'événements.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setchannel')
                .setDescription('Définir le canal de logs d\'audit pour ce serveur.')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Le canal textuel pour les logs d\'audit.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Mettre à True pour désactiver entièrement la journalisation d\'audit.')
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('filter')
                .setDescription('Gérer la liste d\'exclusion des logs (utilisateurs et canaux à ignorer).')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('add')
                        .setDescription('Ajouter un utilisateur ou un canal à la liste d\'exclusion des logs.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('S\'il faut ignorer un utilisateur ou un canal.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Utilisateur', value: 'user' },
                                    { name: 'Canal', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('L\'ID de l\'utilisateur ou du canal à ignorer.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('remove')
                        .setDescription('Retirer un utilisateur ou un canal de la liste d\'exclusion des logs.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('S\'il s\'agit d\'un utilisateur ou d\'un canal.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Utilisateur', value: 'user' },
                                    { name: 'Canal', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('L\'ID de l\'utilisateur ou du canal à retirer de la liste d\'exclusion.')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            // setchannel and filter both need a reply deferred before their logic runs
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            await InteractionHelper.safeDefer(interaction);

            if (subcommand === 'setchannel') {
                return await setchannel.execute(interaction, config, client);
            }

            if (subcommandGroup === 'filter') {
                return await filter.execute(interaction, config, client);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Sous-commande inconnue', 'Cette sous-commande n\'est pas reconnue.')],
            });
        } catch (error) {
            logger.error('logging command error:', error);
            await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Erreur', 'Une erreur inattendue s\'est produite.')],
                ephemeral: true,
            }).catch(() => {});
        }
    },
};
