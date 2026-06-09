import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getLoggingStatus } from '../../services/loggingService.js';
import { getLevelingConfig } from '../../services/leveling.js';
import { getConfiguration as getJoinToCreateConfiguration } from '../../services/joinToCreateService.js';
import { getWelcomeConfig, getApplicationSettings } from '../../utils/database.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

function pill(enabled) {
    return enabled ? '✅ Activé' : '❌ Désactivé';
}

async function formatChannelMention(guild, id) {
    if (!id) return '`Non configuré`';
    const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
    return channel ? channel.toString() : `⚠️ Introuvable (${id})`;
}

function formatRoleMention(guild, id) {
    if (!id) return '`Non configuré`';
    const role = guild.roles.cache.get(id);
    return role ? role.toString() : `⚠️ Introuvable (${id})`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('overview')
        .setDescription('Aperçu en lecture seule de tous les statuts des systèmes du serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const [guildConfig, loggingStatus, levelingConfig, welcomeConfig, applicationConfig, joinToCreateConfig] =
                await Promise.all([
                    getGuildConfig(client, interaction.guildId),
                    getLoggingStatus(client, interaction.guildId),
                    getLevelingConfig(client, interaction.guildId),
                    getWelcomeConfig(client, interaction.guildId),
                    getApplicationSettings(client, interaction.guildId),
                    getJoinToCreateConfiguration(client, interaction.guildId),
                ]);

            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
            const autoRoleId = guildConfig.autoRole || welcomeConfig?.roleIds?.[0];

            // ── Channels ──────────────────────────────────────────────────────
            const [auditChannel, lifecycleChannel, transcriptChannel, reportChannel, birthdayChannel] =
                await Promise.all([
                    formatChannelMention(interaction.guild, loggingStatus.channelId || guildConfig.logging?.channelId || guildConfig.logChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId),
                    formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId),
                    formatChannelMention(interaction.guild, guildConfig.reportChannelId),
                    formatChannelMention(interaction.guild, guildConfig.birthdayChannelId),
                ]);

            const embed = new EmbedBuilder()
                .setTitle('🖥️ Aperçu du système')
                .setDescription(`Aperçu en lecture seule pour **${interaction.guild.name}**. Utilisez le tableau de bord de la commande correspondante pour effectuer des modifications.`)
                .setColor(getColor('primary'))
                .addFields(
                    // ── Core systems ──
                    {
                        name: '⚙️ Systèmes principaux',
                        value: [
                            `🧾 **Journal d'audit** — ${pill(Boolean(loggingStatus.enabled))}`,
                            `📈 **Niveaux** — ${pill(Boolean(levelingConfig?.enabled))}`,
                            `👋 **Bienvenue** — ${pill(Boolean(welcomeConfig?.enabled))}`,
                            `👋 **Au revoir** — ${pill(Boolean(welcomeConfig?.goodbyeEnabled))}`,
                            `🎂 **Anniversaires** — ${pill(Boolean(guildConfig.birthdayChannelId))}`,
                            `📋 **Candidatures** — ${pill(Boolean(applicationConfig?.enabled))}`,
                            `✅ **Vérification** — ${pill(verificationEnabled)}`,
                            `🤖 **Vérification auto** — ${pill(autoVerifyEnabled)}`,
                            `🎧 **Rejoindre pour créer** — ${pill(Boolean(joinToCreateConfig?.enabled))}`,
                            `🛡️ **Rôle auto** — ${autoRoleId ? `✅ ${formatRoleMention(interaction.guild, autoRoleId)}` : '❌ Désactivé'}`,
                        ].join('\n'),
                        inline: false,
                    },
                    // ── Channels ──
                    {
                        name: '📡 Salons configurés',
                        value: [
                            `**Journal d'audit :** ${auditChannel}`,
                            `**Cycle de vie des tickets :** ${lifecycleChannel}`,
                            `**Transcriptions des tickets :** ${transcriptChannel}`,
                            `**Signalements :** ${reportChannel}`,
                            `**Anniversaires :** ${birthdayChannel}`,
                        ].join('\n'),
                        inline: false,
                    },
                    // ── Refresh stamp ──
                    {
                        name: '🕒 Aperçu pris le',
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true,
                    },
                )
                .setFooter({ text: 'Lecture seule — exécutez /logging dashboard pour gérer les paramètres d\'audit' })
                .setTimestamp();

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('overview command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Erreur d\'aperçu', 'Impossible de charger l\'aperçu du système.')],
            });
        }
    },
};
