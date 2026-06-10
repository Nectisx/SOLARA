import { EmbedBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';





export const MessageTemplates = {
    SUCCESS: {
        DATA_UPDATED: (action, description) => new EmbedBuilder()
            .setColor(getColor('success'))
            .setTitle(`✅ ${action.charAt(0).toUpperCase() + action.slice(1)} réussi`)
            .setDescription(description)
            .setTimestamp(),

        COMMAND_EXECUTED: (command) => new EmbedBuilder()
            .setColor(getColor('success'))
            .setTitle('✅ Commande exécutée')
            .setDescription(`Commande \`${command}\` exécutée avec succès`)
            .setTimestamp()
    },

    ERRORS: {
        DATABASE_ERROR: (operation) => new EmbedBuilder()
            .setColor(getColor('error'))
            .setTitle('🗄️ Erreur de base de données')
            .setDescription(`Un problème est survenu avec la base de données lors de l'opération : ${operation}. Veuillez réessayer plus tard.`)
            .setTimestamp(),

        INSUFFICIENT_FUNDS: (currency, description) => new EmbedBuilder()
            .setColor(getColor('warning'))
            .setTitle('💰 Fonds insuffisants')
            .setDescription(description || `Vous n'avez pas assez de ${currency} pour cette opération.`)
            .setTimestamp(),

        PERMISSION_DENIED: (permission) => new EmbedBuilder()
            .setColor(getColor('error'))
            .setTitle('🚫 Permission refusée')
            .setDescription(`Vous avez besoin de la permission \`${permission}\` pour utiliser cette commande.`)
            .setTimestamp(),

        INVALID_INPUT: (field) => new EmbedBuilder()
            .setColor(getColor('warning'))
            .setTitle('❌ Entrée invalide')
            .setDescription(`La valeur fournie pour ${field || 'le champ'} est invalide. Veuillez vérifier et réessayer.`)
            .setTimestamp()
    },

    INFO: {
        LOADING: (description) => new EmbedBuilder()
            .setColor(getColor('warning'))
            .setTitle('⏳ Chargement...')
            .setDescription(description || 'Veuillez patienter pendant le traitement de votre requête.')
            .setTimestamp(),

        PROCESSING: (description) => new EmbedBuilder()
            .setColor(getColor('info'))
            .setTitle('⚙️ Traitement en cours')
            .setDescription(description || 'Traitement de votre requête en cours...')
            .setTimestamp()
    }
};

export const ContextualMessages = {
    configUpdated: (title, configLines) => new EmbedBuilder()
        .setColor(getColor('success'))
        .setTitle(`✅ ${title} mis à jour`)
        .setDescription(configLines.join('\n'))
        .setTimestamp()
};

export default MessageTemplates;



