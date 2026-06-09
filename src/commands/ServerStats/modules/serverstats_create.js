import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';






import { InteractionHelper } from '../../../utils/interactionHelper.js';
export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

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
            embeds: [errorEmbed("Vous avez besoin de la permission **Gérer les salons** pour créer des compteurs.")]
        }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Veuillez sélectionner une catégorie valide pour le salon compteur.")]
            }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`Un compteur **${getCounterTypeLabel(type)}** existe déjà pour ce serveur${duplicateChannel ? ` dans ${duplicateChannel}` : ''}. Supprimez-le avant d'en créer un autre.`)]
            }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Salon compteur créé par ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`Un compteur existe déjà pour le salon **${targetChannel.name}**. Supprimez-le d'abord ou choisissez un type différent.`)]
            }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Échec de la création du compteur lors de la sauvegarde').catch(() => null);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Échec de la sauvegarde des données du compteur. Veuillez réessayer.")]
            }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Compteur créé mais échec de la mise à jour du nom du salon. Le compteur se mettra à jour lors de la prochaine exécution planifiée.")]
            }).catch(logger.error);
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`✅ **Compteur créé avec succès !**\n\n**Type :** ${getCounterTypeLabel(type)}\n**Type de salon :** ${targetChannel.type === ChannelType.GuildVoice ? 'vocal' : 'texte'}\n**Catégorie :** ${category}\n**Salon :** ${targetChannel}\n**Nom du salon :** ${targetChannel.name}\n**ID du compteur :** \`${newCounter.id}\`\n\nLe compteur se mettra à jour automatiquement toutes les 15 minutes.\n\nUtilisez \`/counter list\` pour voir tous les compteurs.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Une erreur s'est produite lors de la création du compteur. Veuillez réessayer.")]
        }).catch(logger.error);
    }
}



