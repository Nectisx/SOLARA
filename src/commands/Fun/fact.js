import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const facts = [
  "Un jour sur Vénus est plus long qu'une année sur Vénus.",
  "La guerre la plus courte de l'histoire s'est déroulée entre la Grande-Bretagne et Zanzibar le 27 août 1896. Elle a duré entre 38 et 45 minutes.",
  "Le mot 'Strengths' est le plus long mot de la langue anglaise ne contenant qu'une seule voyelle.",
  "Les pieuvres ont trois cœurs et du sang bleu.",
  "Il y a plus d'arbres sur Terre que d'étoiles dans la Voie lactée.",
  "Le poids total de toutes les fourmis sur Terre serait à peu près égal au poids total de tous les humains.",
];

export default {
    data: new SlashCommandBuilder()
    .setName("fact")
    .setDescription("Partage un fait aléatoire et intéressant."),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const randomFact = facts[Math.floor(Math.random() * facts.length)];

      const embed = successEmbed("🧠 Le saviez-vous ?", `💡 **${randomFact}**`);

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Fact command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Fact command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fact',
        source: 'fact_command'
      });
    }
  },
};




