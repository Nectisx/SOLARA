import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRoleMessage, deleteReactionRoleMessage } from '../services/reactionRoleService.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      try {
        const reactionRoleData = await getReactionRoleMessage(message.client, message.guild.id, message.id);
        if (reactionRoleData) {
          await deleteReactionRoleMessage(message.client, message.guild.id, message.id);
          logger.info(`Cleaned up reaction role database entry for manually deleted message ${message.id} in guild ${message.guild.id}`);

          try {
            await logEvent({
              client: message.client,
              guildId: message.guild.id,
              eventType: EVENT_TYPES.REACTION_ROLE_DELETE,
              data: {
                description: `Le message de rôle par réaction a été supprimé manuellement et retiré de la base de données.`,
                channelId: message.channel?.id,
                fields: [
                  {
                    name: '🗑️ ID du message',
                    value: message.id,
                    inline: true
                  },
                  {
                    name: '📍 Salon',
                    value: message.channel ? `${message.channel.toString()} (${message.channel.id})` : 'Inconnu',
                    inline: true
                  },
                  {
                    name: '🧹 Nettoyage',
                    value: 'Entrée de la base de données supprimée automatiquement',
                    inline: false
                  }
                ]
              }
            });
          } catch (logCleanupError) {
            logger.warn('Failed to log reaction role cleanup after manual message deletion:', logCleanupError);
          }
        }
      } catch (reactionRoleCleanupError) {
        logger.warn(`Failed to clean up reaction role data for deleted message ${message.id}:`, reactionRoleCleanupError);
      }

      if (message.author?.bot) return;

      const fields = [];

      
      if (message.author) {
        fields.push({
          name: '👤 Auteur',
          value: `${message.author.tag} (${message.author.id})`,
          inline: true
        });
      }

      
      fields.push({
        name: '💬 Salon',
        value: `${message.channel.toString()} (${message.channel.id})`,
        inline: true
      });

      
      if (message.content) {
        const content = message.content.length > MAX_LOGGED_MESSAGE_CONTENT_LENGTH 
          ? message.content.substring(0, MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3) + '...' 
          : message.content;
        fields.push({
          name: '📝 Contenu',
          value: content || '*(message vide)*',
          inline: false
        });
      }

      
      fields.push({
        name: '🆔 ID du message',
        value: message.id,
        inline: true
      });

      
      fields.push({
        name: '📅 Créé',
        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
        inline: true
      });

      
      if (message.attachments.size > 0) {
        fields.push({
          name: '📎 Pièces jointes',
          value: message.attachments.size.toString(),
          inline: true
        });
      }

      await logEvent({
        client: message.client,
        guildId: message.guild.id,
        eventType: EVENT_TYPES.MESSAGE_DELETE,
        data: {
          description: `Un message a été supprimé dans ${message.channel.toString()}`,
          userId: message.author?.id,
          channelId: message.channel.id,
          fields
        }
      });

    } catch (error) {
      logger.error('Error in messageDelete event:', error);
    }
  }
};
