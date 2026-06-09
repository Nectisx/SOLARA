import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    LabelBuilder,
    CheckboxBuilder,
    TextDisplayBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { safeDeferInteraction } from '../../../utils/interactionValidator.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplicationRoles,
    saveApplicationRoles,
    getApplicationRoleSettings,
    saveApplicationRoleSettings,
    deleteApplicationRoleSettings,
    getApplications,
    deleteApplication,
} from '../../../utils/database.js';

// ─── Embed & Menu Builders ────────────────────────────────────────────────────

function buildDashboardEmbed(settings, roles, guild) {
    const logChannel = settings.logChannelId ? `<#${settings.logChannelId}>` : '`Not set`';
    const managerRoleList =
        settings.managerRoles?.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
            : '`None configured`';
    const roleList =
        roles.length > 0
            ? roles.map(r => `<@&${r.roleId}> — ${r.name}`).join('\n')
            : '`No application roles configured`';
    const questionCount = settings.questions?.length ?? 0;
    const firstQ =
        settings.questions?.[0]
            ? `\`${settings.questions[0].length > 55 ? settings.questions[0].substring(0, 55) + '…' : settings.questions[0]}\``
            : '`Not set`';

    return new EmbedBuilder()
        .setTitle('📋 Tableau de bord des candidatures')
        .setDescription(`Gérer les paramètres des candidatures pour **${guild.name}**.\nSélectionnez une option ci-dessous pour modifier un paramètre.`)
        .setColor(getColor('info'))
        .addFields(
            { name: '⚙️ Statut des candidatures', value: settings.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '📢 Salon de logs', value: logChannel, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🛡️ Rôles gestionnaires', value: managerRoleList, inline: false },
            { name: '📝 Questions', value: `${questionCount} configurée(s) — première : ${firstQ}`, inline: false },
            { name: '🎭 Rôles de candidature', value: roleList, inline: false },
            {
                name: '🗑️ Rétention',
                value: `En attente : **${settings.pendingApplicationRetentionDays ?? 30}j** · Examinées : **${settings.reviewedApplicationRetentionDays ?? 14}j**`,
                inline: false,
            },
        )
        .setFooter({ text: 'Le tableau de bord se ferme après 15 minutes d\'inactivité' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${guildId}`)
        .setPlaceholder('Sélectionner un paramètre à configurer...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Salon de logs')
                .setDescription('Définir le salon où les nouvelles candidatures sont enregistrées')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Rôles gestionnaires')
                .setDescription('Ajouter ou retirer un rôle pouvant gérer les candidatures')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier les questions')
                .setDescription('Personnaliser les questions affichées sur le formulaire de candidature')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ajouter un rôle de candidature')
                .setDescription('Ajouter un rôle pour lequel les membres peuvent postuler')
                .setValue('role_add')
                .setEmoji('➕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retirer un rôle de candidature')
                .setDescription('Retirer un rôle de la liste des candidatures')
                .setValue('role_remove')
                .setEmoji('➖'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Période de rétention')
                .setDescription('Définir la durée de conservation des candidatures en attente et examinées')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

function buildButtonRow(settings, guildId, disabled = false) {
    const systemOn = settings.enabled === true;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_cfg_toggle_${guildId}`)
            .setLabel('Candidatures')
            .setStyle(systemOn ? ButtonStyle.Success : ButtonStyle.Danger)
            .setDisabled(disabled),
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function refreshDashboard(rootInteraction, settings, roles, guildId) {
    const selectMenu = buildSelectMenu(guildId);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(settings, roles, rootInteraction.guild)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default {
    async execute(interaction, config, client, selectedAppName = null) {
        try {
            const guildId = interaction.guild.id;

            // Defer immediately to prevent Discord interaction timeout
            await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });

            const [settings, roles] = await Promise.all([
                getApplicationSettings(client, guildId),
                getApplicationRoles(client, guildId),
            ]);

            // Check if application system is completely unconfigured
            const isCompletelyUnconfigured = 
                !settings.logChannelId && 
                !settings.enabled && 
                (settings.managerRoles?.length ?? 0) === 0 && 
                roles.length === 0;

            if (isCompletelyUnconfigured) {
                throw new TitanBotError(
                    'Applications system not set up',
                    ErrorTypes.CONFIGURATION,
                    'Le système de candidatures n\'a pas encore été configuré. Veuillez exécuter `/app-admin setup` pour créer votre première candidature.',
                );
            }

            // If no application roles exist, show global settings to add one
            if (roles.length === 0) {
                await showGlobalDashboard(interaction, settings, roles, guildId, client);
                return;
            }

            // If a specific app was selected via autocomplete, show its dashboard directly
            if (selectedAppName) {
                const selectedRole = roles.find(r => r.name.toLowerCase() === selectedAppName.toLowerCase());
                if (selectedRole) {
                    await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
                    return;
                }
                // If name doesn't match, fall through
            }

            // Default: Show first application if no selection made
            const defaultRole = roles[0];
            await showApplicationDashboard(interaction, defaultRole, settings, roles, guildId, client);

        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in app_dashboard:', error);
            throw new TitanBotError(
                `Applications dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the applications dashboard.',
            );
        }
    },
};

// ─── Application Selector (for multiple applications) ──────────────────────────

async function showApplicationSelector(interaction, roles, settings, guildId, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`app_select_${guildId}`)
        .setPlaceholder('Select an application to configure...')
        .addOptions(
            roles.map(role =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(role.name)
                    .setDescription(`Configurer la candidature ${role.name}`)
                    .setValue(role.roleId)
                    .setEmoji('📋'),
            ),
        );

    const embed = new EmbedBuilder()
        .setTitle('🎯 Sélectionner une candidature')
        .setDescription('Choisissez le rôle de candidature que vous souhaitez configurer.')
        .setColor(getColor('info'));

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && i.customId === `app_select_${guildId}`,
        time: 600_000,
        max: 1,
    });

    collector.on('collect', async selectInteraction => {
        const deferred = await safeDeferInteraction(selectInteraction);
        if (!deferred) return;
        
        const selectedRoleId = selectInteraction.values[0];
        const selectedRole = roles.find(r => r.roleId === selectedRoleId);

        if (selectedRole) {
            await showApplicationDashboard(interaction, selectedRole, settings, roles, guildId, client);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Délai expiré', 'Aucune sélection n\'a été faite. Le tableau de bord a été fermé.')],
                components: [],
            }).catch(() => {});
        }
    });
}

// ─── Global Dashboard ──────────────────────────────────────────────────────────

async function showGlobalDashboard(interaction, settings, roles, guildId, client) {
    const selectMenu = buildSelectMenu(guildId);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildDashboardEmbed(settings, roles, interaction.guild)],
        components: [
            buildButtonRow(settings, guildId),
            new ActionRowBuilder().addComponents(selectMenu),
        ],
    });

    setupCollectors(interaction, settings, roles, guildId, client, null);
}

// ─── Application-Specific Dashboard ────────────────────────────────────────────

async function showApplicationDashboard(rootInteraction, selectedRole, settings, roles, guildId, client) {
    const roleObj = rootInteraction.guild.roles.cache.get(selectedRole.roleId);
    
    // Get application-specific settings
    const appSettings = await getApplicationRoleSettings(client, guildId, selectedRole.roleId);
    const questions = appSettings.questions || settings.questions || [];
    const appLogChannelId = appSettings.logChannelId || settings.logChannelId;
    const isEnabled = selectedRole.enabled !== false; // Default to true if not specified

    // Build comprehensive embed
    const logChannelDisplay = appLogChannelId 
        ? `<#${appLogChannelId}>` 
        : '`Inherits global log channel`';
    
    const questionsDisplay = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. \`${q.length > 60 ? q.substring(0, 60) + '…' : q}\``).join('\n')
        : '`Inherits global questions`';
    
    const managerRolesDisplay = settings.managerRoles && settings.managerRoles.length > 0
        ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
        : '`None configured`';

    const embed = new EmbedBuilder()
        .setTitle('🎭 Tableau de bord des candidatures')
        .setDescription(`Configuration pour **${selectedRole.name}**`)
        .setColor(isEnabled ? getColor('success') : getColor('error'))
        .addFields(
            {
                name: '🎭 Rôle',
                value: roleObj ? roleObj.toString() : `<@&${selectedRole.roleId}>`,
                inline: true
            },
            {
                name: '⚙️ Statut de la candidature',
                value: isEnabled ? '✅ **Activé**' : '❌ **Désactivé**',
                inline: true
            },
            { name: '\u200B', value: '\u200B', inline: true },
            {
                name: '📝 Questions',
                value: questionsDisplay,
                inline: false
            },
            {
                name: '📢 Salon de logs',
                value: logChannelDisplay,
                inline: true
            },
            {
                name: '🛡️ Rôles gestionnaires',
                value: managerRolesDisplay,
                inline: true
            },
            {
                name: '🗑️ Période de rétention',
                value: `En attente : **${settings.pendingApplicationRetentionDays ?? 30}j** · Examinées : **${settings.reviewedApplicationRetentionDays ?? 14}j**`,
                inline: false
            },
        )
        .setFooter({ text: 'Le tableau de bord se ferme après 10 minutes d\'inactivité' })
        .setTimestamp();

    // Create dropdown button with customization options
    const configMenu = buildApplicationSelectMenu(guildId, selectedRole.roleId);

    // Create control buttons
    const controlButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_toggle_${selectedRole.roleId}`)
            .setLabel(isEnabled ? 'Désactiver la candidature' : 'Activer la candidature')
            .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_delete_${selectedRole.roleId}`)
            .setLabel('Supprimer la candidature')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    const menuRow = new ActionRowBuilder().addComponents(configMenu);

    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [embed],
        components: [menuRow, controlButtons],
    });

    setupCollectors(rootInteraction, settings, roles, guildId, client, selectedRole.roleId);
}

// ─── Collector Setup ──────────────────────────────────────────────────────────

function setupCollectors(interaction, settings, roles, guildId, client, selectedRoleId) {
    const customIdPrefix = selectedRoleId ? `app_cfg_${selectedRoleId}` : `app_cfg_${guildId}`;
    
    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === interaction.user.id && 
            (selectedRoleId 
                ? i.customId === customIdPrefix
                : (i.customId === `app_cfg_${guildId}` || i.customId === `app_select_${guildId}`)),
        time: 600_000,
    });

    collector.on('collect', async selectInteraction => {
        const selectedOption = selectInteraction.values[0];
        try {
            // Catch expired interactions
            if (!selectInteraction.isStringSelectMenu()) {
                return;
            }
            switch (selectedOption) {
                case 'log_channel':
                    await handleLogChannel(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'manager_role':
                    await handleManagerRole(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'questions':
                    await handleQuestions(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
                case 'role_add':
                    await handleRoleAdd(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'role_remove':
                    await handleRoleRemove(selectInteraction, interaction, settings, roles, guildId, client);
                    break;
                case 'retention':
                    await handleRetention(selectInteraction, interaction, settings, roles, guildId, client, selectedRoleId);
                    break;
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Applications config validation error: ${error.message}`);
            } else {
                logger.error('Unexpected applications dashboard error:', error);
            }

            const errorMessage =
                error instanceof TitanBotError
                    ? error.userMessage || 'Une erreur s\'est produite lors du traitement de votre sélection.'
                    : 'Une erreur inattendue s\'est produite lors de la mise à jour de la configuration.';

            if (!selectInteraction.replied && !selectInteraction.deferred) {
                await safeDeferInteraction(selectInteraction);
            }

            await selectInteraction
                .followUp({
                    embeds: [errorEmbed('Erreur de configuration', errorMessage)],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('\u23f0 Tableau de bord expir\u00e9')
                .setDescription('Ce tableau de bord a \u00e9t\u00e9 ferm\u00e9 en raison d\'inactivit\u00e9. Veuillez relancer la commande pour continuer.')
                .setColor(getColor('error'));
                
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
            }).catch(() => {});
        }
    });

    // ── Global Toggle Button Collector ──────────────────────────────────────────
    if (!selectedRoleId) {
        const globalToggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_cfg_toggle_${guildId}`,
            time: 600_000,
        });

        globalToggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                const wasEnabled = settings.enabled === true;
                settings.enabled = !wasEnabled;

                // Save the updated settings
                await saveApplicationSettings(interaction.client, guildId, settings);

                // Refresh dashboard to show new status
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                const updatedRoles = await getApplicationRoles(interaction.client, guildId);
                await showGlobalDashboard(interaction, updatedSettings, updatedRoles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Candidatures désactivées' : '🟢 Candidatures activées',
                        `Le système de candidatures est maintenant **${wasEnabled ? 'désactivé' : 'activé'}**.\n\n${
                            wasEnabled
                                ? 'Les membres ne pourront plus postuler pour des rôles.'
                                : 'Les membres peuvent maintenant commencer à postuler pour des rôles.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling global application status:', error);
                await toggleInteraction.followUp({
                    embeds: [errorEmbed('Erreur', 'Une erreur s\'est produite lors du basculement du statut des candidatures.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        globalToggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ Délai de configuration expiré')
                    .setDescription('Cette session de tableau de bord a expiré en raison d\'inactivité (10 minutes).\n\nPour continuer à configurer vos candidatures, veuillez relancer la commande.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }

    // ── Delete Button Collector (for application-specific dashboard) ──────────────
    if (selectedRoleId) {
        const btnCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_delete_${selectedRoleId}`,
            time: 600_000,
        });

        btnCollector.on('collect', async btnInteraction => {
            // Show confirmation modal
            const appRoleForDelete = roles.find(r => r.roleId === selectedRoleId);
            const appNameForDelete = appRoleForDelete?.name ?? 'this application';

            const confirmModal = new ModalBuilder()
                .setCustomId('app_delete_confirm')
                .setTitle('Confirmer la suppression de la candidature');

            const deleteWarningText = new TextDisplayBuilder()
                .setContent(`⚠️ Vous êtes sur le point de supprimer définitivement **${appNameForDelete}**. Toutes les candidatures et paramètres stockés pour ce rôle seront supprimés et ne pourront pas être récupérés.`);

            const deleteCheckbox = new CheckboxBuilder()
                .setCustomId('confirm_delete')
                .setDefault(false);

            const deleteCheckboxLabel = new LabelBuilder()
                .setLabel('Je confirme — ceci ne peut pas être annulé')
                .setCheckboxComponent(deleteCheckbox);

            confirmModal
                .addTextDisplayComponents(deleteWarningText)
                .addLabelComponents(deleteCheckboxLabel);

            try {
                await btnInteraction.showModal(confirmModal);
            } catch (error) {
                logger.error('Error showing delete confirmation modal:', error);
                await btnInteraction.followUp({
                    embeds: [errorEmbed('Erreur', 'Impossible d\'afficher le modal de confirmation. Veuillez réessayer.')],
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
                return;
            }

            try {
                const confirmSubmit = await btnInteraction.awaitModalSubmit({
                    time: 60_000,
                    filter: i =>
                        i.customId === 'app_delete_confirm' && i.user.id === btnInteraction.user.id,
                }).catch(() => null);

                if (!confirmSubmit) {
                    await btnInteraction.followUp({
                        embeds: [errorEmbed('Annulé', 'La suppression de la candidature a été annulée.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const confirmed = confirmSubmit.fields.getCheckbox('confirm_delete');
                if (!confirmed) {
                    await confirmSubmit.reply({
                        embeds: [errorEmbed('Non confirmé', 'Vous devez cocher la case de confirmation pour supprimer la candidature.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                // Delete the application
                await handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client);
                collector.stop();
                btnCollector.stop();

            } catch (error) {
                logger.error('Error confirming application deletion:', error);
                await btnInteraction.followUp({
                    embeds: [errorEmbed('Erreur', 'Une erreur s\'est produite lors de la suppression de la candidature.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        btnCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ Délai de configuration expiré')
                    .setDescription('Cette session de tableau de bord a expiré en raison d\'inactivité (10 minutes).\n\nPour continuer à configurer vos candidatures, veuillez relancer la commande.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });

        // ── Toggle Enable/Disable Button Collector ──────────────────────────────
        const toggleCollector = interaction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === interaction.user.id &&
                i.customId === `app_toggle_${selectedRoleId}`,
            time: 900_000,
        });

        toggleCollector.on('collect', async toggleInteraction => {
            const deferred = await safeDeferInteraction(toggleInteraction);
            if (!deferred) return;
            
            try {
                // Find and toggle the role
                const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
                if (roleIndex === -1) {
                    await toggleInteraction.followUp({
                        embeds: [errorEmbed('Introuvable', 'Rôle de candidature introuvable.')],
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                const wasEnabled = roles[roleIndex].enabled !== false;
                roles[roleIndex].enabled = !wasEnabled;

                // Save the updated roles
                await saveApplicationRoles(interaction.client, guildId, roles);

                // Refresh dashboard to show new status
                const updatedRole = roles[roleIndex];
                const updatedSettings = await getApplicationSettings(interaction.client, guildId);
                await showApplicationDashboard(interaction, updatedRole, updatedSettings, roles, guildId, interaction.client);

                await toggleInteraction.followUp({
                    embeds: [successEmbed(
                        wasEnabled ? '🔴 Candidature désactivée' : '🟢 Candidature activée',
                        `La candidature **${updatedRole.name}** est maintenant **${wasEnabled ? 'désactivée' : 'activée'}**.\n\n${
                            wasEnabled
                                ? 'Cette candidature n\'apparaîtra plus dans les options de `/apply submit`.'
                                : 'Cette candidature apparaîtra maintenant dans les options de `/apply submit`.'
                        }`,
                    )],
                    flags: MessageFlags.Ephemeral,
                });

            } catch (error) {
                logger.error('Error toggling application status:', error);
                await toggleInteraction.followUp({
                    embeds: [errorEmbed('Erreur', 'Une erreur s\'est produite lors du basculement du statut de la candidature.')],
                    flags: MessageFlags.Ephemeral,
                });
            }
        });

        toggleCollector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏱️ Délai de configuration expiré')
                    .setDescription('Cette session de tableau de bord a expiré en raison d\'inactivité (10 minutes).\n\nPour continuer à configurer vos candidatures, veuillez relancer la commande.')
                    .setColor(getColor('warning'));
                    
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [timeoutEmbed],
                    components: [],
                }).catch(() => {});
            }
        });
    }
}

// ─── Build Select Menus ────────────────────────────────────────────────────────

function buildApplicationSelectMenu(guildId, roleId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`app_cfg_${roleId}`)
        .setPlaceholder('Sélectionner un paramètre à configurer...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Salon de logs')
                .setDescription('Définir le salon où les candidatures sont enregistrées')
                .setValue('log_channel')
                .setEmoji('📢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Rôles gestionnaires')
                .setDescription('Ajouter ou retirer un rôle pouvant gérer les candidatures')
                .setValue('manager_role')
                .setEmoji('🛡️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier les questions')
                .setDescription('Personnaliser les questions affichées sur le formulaire de candidature')
                .setValue('questions')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Période de rétention')
                .setDescription('Définir la durée de conservation des candidatures en attente et examinées')
                .setValue('retention')
                .setEmoji('🗑️'),
        );
}

// ─── Log Channel ──────────────────────────────────────────────────────────────

async function handleLogChannel(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentChannel = settings.logChannelId;
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentChannel = roleSettings.logChannelId || settings.logChannelId;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`)
        .setTitle('📢 Configurer le salon de logs');

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('log_channel')
        .setPlaceholder('Select a text channel...')
        .setMinValues(1)
        .setMaxValues(1)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true);

    const channelLabel = new LabelBuilder()
        .setLabel('Salon de logs')
        .setDescription('Salon où les nouvelles candidatures seront enregistrées')
        .setChannelSelectMenuComponent(channelSelect);

    modal.addLabelComponents(channelLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_log_channel_modal_${guildId}_${selectedRoleId || 'global'}`,
        });

        const channelId = modalSubmission.fields.getField('log_channel').values[0];
        const channel = selectInteraction.guild.channels.cache.get(channelId);

        if (selectedRoleId) {
            const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
            roleSettings.logChannelId = channelId;
            await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
        } else {
            settings.logChannelId = channelId;
            await saveApplicationSettings(client, guildId, settings);
        }

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Salon de logs mis à jour', `Les logs de candidatures seront désormais envoyés vers ${channel ?? `<#${channelId}>`}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in log channel modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Une erreur s\'est produite lors de la mise à jour du salon de logs.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Manager Role ─────────────────────────────────────────────────────────────

async function handleManagerRole(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_manager_role_modal_${guildId}`)
        .setTitle('🛡️ Configurer les rôles gestionnaires');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('manager_roles')
        .setPlaceholder('Sélectionner les rôles pour accorder l\'accès gestionnaire...')
        .setMinValues(1)
        .setMaxValues(5)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Rôles gestionnaires')
        .setDescription('Les rôles sélectionnés seront activés/désactivés en tant que rôles gestionnaires')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_manager_role_modal_${guildId}`,
        });

        const selectedRoleIds = modalSubmission.fields.getField('manager_roles').values;
        const roleSet = new Set(settings.managerRoles ?? []);

        for (const roleId of selectedRoleIds) {
            if (roleSet.has(roleId)) {
                roleSet.delete(roleId);
            } else {
                roleSet.add(roleId);
            }
        }

        settings.managerRoles = Array.from(roleSet);
        await saveApplicationSettings(client, guildId, settings);

        const finalList = settings.managerRoles.length > 0
            ? settings.managerRoles.map(id => `<@&${id}>`).join(', ')
            : '`None`';

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Rôles gestionnaires mis à jour', `Rôles gestionnaires actuels : ${finalList}`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in manager role modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Une erreur s\'est produite lors de la mise à jour des rôles gestionnaires.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Edit Questions ───────────────────────────────────────────────────────────

async function handleQuestions(selectInteraction, rootInteraction, settings, roles, guildId, client, selectedRoleId) {
    let currentQuestions = settings.questions ?? [];
    
    if (selectedRoleId) {
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        currentQuestions = roleSettings.questions ?? currentQuestions;
    }

    const modal = new ModalBuilder()
        .setCustomId('app_cfg_questions')
        .setTitle('Modifier les questions de candidature')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q1')
                    .setLabel('Question 1 (obligatoire)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[0] ?? '')
                    .setMaxLength(100)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q2')
                    .setLabel('Question 2 (optionnelle)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[1] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q3')
                    .setLabel('Question 3 (optionnelle)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[2] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q4')
                    .setLabel('Question 4 (optionnelle)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[3] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('q5')
                    .setLabel('Question 5 (optionnelle)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentQuestions[4] ?? '')
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_questions' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newQuestions = ['q1', 'q2', 'q3', 'q4', 'q5']
        .map(key => submitted.fields.getTextInputValue(key).trim())
        .filter(Boolean);

    if (newQuestions.length === 0) {
        await submitted.reply({
            embeds: [errorEmbed('Aucune question', 'Au moins une question est requise.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (selectedRoleId) {
        // Save per-application questions
        const roleSettings = await getApplicationRoleSettings(client, guildId, selectedRoleId);
        roleSettings.questions = newQuestions;
        await saveApplicationRoleSettings(client, guildId, selectedRoleId, roleSettings);
    } else {
        // Save global questions
        settings.questions = newQuestions;
        await saveApplicationSettings(client, guildId, settings);
    }

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Questions mises à jour',
                `${newQuestions.length} question${newQuestions.length !== 1 ? 's' : ''} sauvegardée(s).`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId);
}

// ─── Add Application Role ─────────────────────────────────────────────────────

async function handleRoleAdd(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_add_modal_${guildId}`)
        .setTitle('➕ Ajouter un rôle de candidature');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('application_role')
        .setPlaceholder('Sélectionner le rôle pour lequel les membres peuvent postuler...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Rôle de candidature')
        .setDescription('Sélectionner le rôle Discord pour lequel les membres postuleront')
        .setRoleSelectMenuComponent(roleSelect);

    const nameInput = new TextInputBuilder()
        .setCustomId('role_name')
        .setLabel('Nom d\'affichage (laisser vide pour utiliser le nom du rôle)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(50)
        .setRequired(false);

    modal.addLabelComponents(roleLabel);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_add_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('application_role').values[0];
        const role = selectInteraction.guild.roles.cache.get(roleId);
        const customName = modalSubmission.fields.getTextInputValue('role_name').trim() || role?.name || roleId;

        if (roles.some(r => r.roleId === roleId)) {
            await modalSubmission.reply({
                embeds: [errorEmbed('Déjà ajouté', `${role ?? roleId} est déjà un rôle de candidature.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        roles.push({ roleId, name: customName });
        await saveApplicationRoles(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Rôle ajouté', `${role ?? roleId} ajouté en tant que **${customName}**.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role add modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Une erreur s\'est produite lors de l\'ajout du rôle de candidature.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Remove Application Role ──────────────────────────────────────────────────

async function handleRoleRemove(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    if (roles.length === 0) {
        await selectInteraction.followUp({
            embeds: [errorEmbed('Aucun rôle', 'Aucun rôle de candidature n\'est configuré pour être retiré.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`app_cfg_role_remove_modal_${guildId}`)
        .setTitle('➖ Retirer un rôle de candidature');

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('remove_role')
        .setPlaceholder('Sélectionner le rôle à retirer...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const roleLabel = new LabelBuilder()
        .setLabel('Retirer un rôle de candidature')
        .setDescription('Sélectionner le rôle à retirer de la liste des candidatures')
        .setRoleSelectMenuComponent(roleSelect);

    modal.addLabelComponents(roleLabel);

    await selectInteraction.showModal(modal);

    try {
        const modalSubmission = await selectInteraction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === selectInteraction.user.id && i.customId === `app_cfg_role_remove_modal_${guildId}`,
        });

        const roleId = modalSubmission.fields.getField('remove_role').values[0];
        const index = roles.findIndex(r => r.roleId === roleId);

        if (index === -1) {
            await modalSubmission.reply({
                embeds: [errorEmbed('Introuvable', `<@&${roleId}> n'est pas dans la liste des rôles de candidature.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        roles.splice(index, 1);
        await saveApplicationRoles(client, guildId, roles);

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Rôle retiré', `<@&${roleId}> a été retiré des rôles de candidature.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, settings, roles, guildId);
    } catch (error) {
        if (error.code === 'INTERACTION_TIMEOUT') return;
        logger.error('Error in role remove modal:', error);
        await selectInteraction.followUp({
            embeds: [errorEmbed('Une erreur s\'est produite lors du retrait du rôle de candidature.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}

// ─── Retention Period ─────────────────────────────────────────────────────────

async function handleRetention(selectInteraction, rootInteraction, settings, roles, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('app_cfg_retention')
        .setTitle('Périodes de rétention des candidatures');

    const retentionInfo = new TextDisplayBuilder()
        .setContent(
            '**En attente** — durée de conservation des candidatures non répondues/en cours avant suppression automatique.\n' +
            '**Examinées** — durée de conservation des candidatures approuvées ou refusées.\n' +
            '-# Entrez un nombre entier entre 1 et 3650 (max 10 ans).',
        );

    const pendingLabel = new LabelBuilder()
        .setLabel('Rétention en attente (jours)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('pending_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.pendingApplicationRetentionDays ?? 30))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    const reviewedLabel = new LabelBuilder()
        .setLabel('Rétention examinées (jours)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('reviewed_days')
                .setStyle(TextInputStyle.Short)
                .setValue(String(settings.reviewedApplicationRetentionDays ?? 14))
                .setMaxLength(4)
                .setMinLength(1)
                .setRequired(true),
        );

    modal
        .addTextDisplayComponents(retentionInfo)
        .addLabelComponents(pendingLabel, reviewedLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'app_cfg_retention' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const pendingDays = parseInt(submitted.fields.getTextInputValue('pending_days').trim(), 10);
    const reviewedDays = parseInt(submitted.fields.getTextInputValue('reviewed_days').trim(), 10);

    if (isNaN(pendingDays) || pendingDays < 1 || pendingDays > 3650) {
        await submitted.reply({
            embeds: [errorEmbed('Valeur invalide', 'La rétention en attente doit être un nombre entier entre **1** et **3650** jours.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (isNaN(reviewedDays) || reviewedDays < 1 || reviewedDays > 3650) {
        await submitted.reply({
            embeds: [errorEmbed('Valeur invalide', 'La rétention examinées doit être un nombre entier entre **1** et **3650** jours.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    settings.pendingApplicationRetentionDays = pendingDays;
    settings.reviewedApplicationRetentionDays = reviewedDays;
    await saveApplicationSettings(client, guildId, settings);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Rétention mise à jour',
                `Les candidatures en attente seront conservées pendant **${pendingDays} jours**.\nLes candidatures examinées seront conservées pendant **${reviewedDays} jours**.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, settings, roles, guildId);
}

// ─── Delete Application ───────────────────────────────────────────────────────

async function handleDeleteApplication(confirmSubmit, selectedRoleId, guildId, roles, client) {
    try {
        // Find the application in the roles array
        const roleIndex = roles.findIndex(r => r.roleId === selectedRoleId);
        if (roleIndex === -1) {
            await confirmSubmit.reply({
                embeds: [errorEmbed('Introuvable', 'Rôle de candidature introuvable.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const deletedRole = roles[roleIndex];

        // Remove from roles array
        roles.splice(roleIndex, 1);

        // Save updated roles list
        await saveApplicationRoles(client, guildId, roles);

        // Delete per-application settings
        await deleteApplicationRoleSettings(client, guildId, selectedRoleId);

        // Get all applications for this guild and find ones with this roleId
        const allApplications = await getApplications(client, guildId);
        const applicationsToDelete = allApplications.filter(app => app.roleId === selectedRoleId);

        // Delete each application
        for (const app of applicationsToDelete) {
            await deleteApplication(client, guildId, app.id, app.userId);
        }

        // Send success message
        await confirmSubmit.reply({
            embeds: [
                successEmbed(
                    '🗑️ Candidature supprimée',
                    `La candidature pour <@&${selectedRoleId}> (**${deletedRole.name}**) a été définitivement supprimée.\n\n` +
                    `Supprimé(es) : **${applicationsToDelete.length}** candidature${applicationsToDelete.length !== 1 ? 's' : ''}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

    } catch (error) {
        logger.error('Error in handleDeleteApplication:', error);
        await confirmSubmit.reply({
            embeds: [errorEmbed('Erreur', 'Une erreur s\'est produite lors de la suppression de la candidature. Veuillez réessayer.')],
            flags: MessageFlags.Ephemeral,
        });
    }
}
