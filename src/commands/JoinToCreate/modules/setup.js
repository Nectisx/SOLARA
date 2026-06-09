import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerChannel = await interaction.guild.channels.create({
                name: 'Rejoindre pour créer',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                `Salon déclencheur créé : ${triggerChannel}\n\n` +
                `**Paramètres :**\n` +
                `• Modèle de nom de salon temporaire : \`${nameTemplate}\`\n` +
                `• Limite d'utilisateurs : ${userLimit === 0 ? 'Aucune limite' : userLimit + ' utilisateurs'}\n` +
                `• Débit binaire : ${bitrate} kbps\n` +
                `${category ? `• Catégorie : ${category.name}` : '• Catégorie : Aucune (niveau racine)'}\n\n` +
                `Lorsque des utilisateurs rejoignent ce salon, un salon vocal temporaire sera créé pour eux.`,
                '✅ Configuration Rejoindre pour créer terminée'
            );

            try {
                if (interaction.deferred) {
                    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                logger.error('Error responding to interaction:', responseError);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHelper.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.error('All response attempts failed:', e);
                }
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Error in JoinToCreate setup:', error);
            throw new TitanBotError(
                `Setup failed: ${error.message}`,
                ErrorTypes.DISCORD_API,
                'Impossible de configurer le système Rejoindre pour créer.'
            );
        }
    }
};



