import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';






import { InteractionHelper } from '../../../utils/interactionHelper.js';
export async function handleUpdate(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

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
            embeds: [errorEmbed("Vous avez besoin de la permission **Gérer les salons** pour mettre à jour des compteurs.")]
        }).catch(logger.error);
        return;
    }

    if (!newType) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Vous devez fournir un nouveau type de compteur pour la mise à jour.")]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(`Compteur avec l'ID \`${counterId}\` introuvable. Utilisez \`/counter list\` pour voir tous les compteurs.`)]
            }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Le salon associé à ce compteur n'existe plus. Vous ne pouvez pas mettre à jour un compteur pour un salon supprimé.")]
            }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(`Un compteur **${getCounterTypeLabel(newType)}** existe déjà pour ce serveur${existingChannel ? ` dans ${existingChannel}` : ''}. Supprimez-le avant de réutiliser ce type.`)]
                }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Échec de la sauvegarde des données du compteur mis à jour. Veuillez réessayer.")]
            }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);
        if (!updated) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Compteur mis à jour mais échec de la mise à jour du nom du salon. Le compteur se mettra à jour lors de la prochaine exécution planifiée.")]
            }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`✅ **Compteur mis à jour avec succès !**\n\n**ID du compteur :** \`${counterId}\`\n**Type modifié :** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n**Paramètres actuels :**\n**Type :** ${getCounterEmoji(updatedCounter.type)} ${getCounterTypeLabel(updatedCounter.type)}\n**Salon :** ${finalChannel}\n**Nom du salon :** ${finalChannel.name}\n\nLe compteur se mettra à jour automatiquement toutes les 15 minutes.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error updating counter:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed("Une erreur s'est produite lors de la mise à jour du compteur. Veuillez réessayer.")]
        }).catch(logger.error);
    }
}



