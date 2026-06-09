import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';






import { InteractionHelper } from '../../../utils/interactionHelper.js';
export async function handleList(interaction, client) {
    const guild = interaction.guild;
    
    // Defer reply immediately to ensure interaction is acknowledged
    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }
    
    // Check permissions after deferring
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Vous avez besoin de la permission **Gérer les salons** pour voir les compteurs.")]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        // Clean up counters with deleted channels
        const validCounters = [];
        const orphanedCounters = [];
        
        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guild.id}`);
            }
        }
        
        // Save cleaned counters if any were orphaned
        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: "📋 Compteurs du serveur",
                description: "Aucun compteur n'a encore été configuré pour ce serveur.\n\nUtilisez `/counter create` pour créer votre premier compteur !",
                color: getColor('warning')
            });

            embed.addFields({
                name: "🔧 **Types de compteurs disponibles**",
                value: "👥 **Membres + Bots** - Total des membres du serveur\n👤 **Membres uniquement** - Membres humains seulement\n🤖 **Bots uniquement** - Bots seulement",
                inline: false
            });

            embed.addFields({
                name: "📝 **Exemples d'utilisation**",
                value: "`/counter create type:members channel_type:voice category:Stats`\n`/counter create type:bots channel_type:text category:Server Info`\n`/counter list`",
                inline: false
            });

            embed.setFooter({
                text: "Système de compteurs • Mises à jour automatiques toutes les 15 minutes"
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: `📋 Compteurs du serveur (${validCounters.length})`,
            description: "Voici tous les compteurs actifs pour ce serveur.\n\nLes compteurs se mettent à jour automatiquement toutes les 15 minutes.",
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);
            
            if (!channel) {
                // This should not happen since we filtered above, but keep as safety check
                logger.warn(`Counter ${counter.id} still has missing channel after cleanup`);
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':') ? '✅ Actif' : '⚠️ Non mis à jour';
            
            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} Counter #${i + 1} - ${channel.name}`,
                value: `**ID :** \`${counter.id}\`\n**Type :** ${getCounterTypeDisplay(counter.type)}\n**Salon :** ${channel}\n**Comptage actuel :** ${currentCount}\n**Statut :** ${status}\n**Créé le :** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "📊 **Statistiques**",
            value: `**Total compteurs :** ${validCounters.length}\n**Compteurs actifs :** ${validCounters.filter(c => {
                const channel = guild.channels.cache.get(c.channelId);
                return channel && channel.name.includes(':');
            }).length}\n**Prochaine mise à jour :** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "🔧 **Commandes de gestion**",
            value: "`/counter create` - Créer un nouveau compteur\n`/counter update` - Mettre à jour un compteur existant\n`/counter delete` - Supprimer un compteur",
            inline: false
        });

        embed.setFooter({
            text: "Système de compteurs • Mises à jour automatiques toutes les 15 minutes"
        });
        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Une erreur s'est produite lors de la récupération des compteurs. Veuillez réessayer.")]
        }).catch(logger.error);
    }
}






function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}






function getCounterEmoji(type) {
    return getCounterTypeEmoji(type);
}







function getCurrentCount(stats, type) {
    switch (type) {
        case "members":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "members_only":
            return stats.humanCount;
        default:
            return 0;
    }
}



