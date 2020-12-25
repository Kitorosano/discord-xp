const mongoose = require("mongoose");
const Equation = require('equations').default;
const levels = require("./models/levels");
let mongoUrl;

// console.log(Equation.solve('1/3x * (2x^2 + 78x - 77) = y')(5+1))

class DiscordXp {

  /**
  * @param {string} [dbUrl] - A valid mongo database URI.
  */

  static async setURL(dbUrl) {
    if (!dbUrl) throw new TypeError("A database url was not provided.");
    mongoUrl = dbUrl;
    return mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  }


  /**
  * @param {string} [userId] - Discord user id.
  * @param {string} [guildId] - Discord guild id.
  */

  static async createUser(userId, guildId) {
    if (!userId) throw new TypeError("An user id was not provided.");
    if (!guildId) throw new TypeError("A guild id was not provided.");

    const isUser = await levels.findOne({ userID: userId, guildID: guildId });
    if (isUser) return false;

    const newUser = new levels({
      userID: userId,
      guildID: guildId
    });

    await newUser.save().catch(e => console.log(`Failed to create user: ${e}`));

    return newUser;
  }


  /**
  * @param {string} [userId] - Discord user id.
  * @param {string} [guildId] - Discord guild id.
  */

  static async deleteUser(userId, guildId) {
    if (!userId) throw new TypeError("An user id was not provided.");
    if (!guildId) throw new TypeError("A guild id was not provided.");

    const user = await levels.findOne({ userID: userId, guildID: guildId });
    if (!user) return false;

    await levels.findOneAndDelete({ userID: userId, guildID: guildId }).catch(e => console.log(`Failed to delete user: ${e}`));

    return user;
  }

  
  /**
  * @param {number} [targetLevel] - Xp required to reach targeted level.
  */
  static xpFor (targetLevel) {
    if (isNaN(targetLevel) || isNaN(parseInt(targetLevel, 10))) throw new TypeError("Target level should be a valid number.");
    if (isNaN(targetLevel)) targetLevel = parseInt(targetLevel, 10);
    if (targetLevel < 1) throw new RangeError("Target level should be a positive number.");
    // return 2 * (Math.pow(targetLevel,2)) + 50 * targetLevel -51;
    return Equation.equation('2x^2 + 50x -51')(targetLevel);
  }

  /**
  * @param {string} [userId] - Discord user id.
  * @param {string} [guildId] - Discord guild id.
  * @param {number} [xp] - Amount of xp to append.
  */

  static async appendXp(userId, guildId, xp) { //El nuevo nivel es lvl = 1.007^xp | xp = log(lvl, 1.007)
    if (!userId) throw new TypeError("An user id was not provided.");
    if (!guildId) throw new TypeError("A guild id was not provided.");
    if (xp !== 0 && !xp) throw new TypeError("An amount of xp was not provided.");

    let user = await levels.findOne({ userID: userId, guildID: guildId });
    if (!user) {
      const newUser = new levels({
        userID: userId,
        guildID: guildId,
        xp: 1,
        totalXP: 1,
        level: 1,
        lastUpdated: new Date()
      });

      await newUser.save().catch(e => console.log(`Failed to save new user.`));
      return true;
    };
    
    let hasLeveledUp = false;
    if(Date.now() - user.lastUpdated > 60000){ //EXP POR MINUTO

      user.xp += xp;
      user.totalXP += xp;
      const xpToNextLvl = this.xpFor(user.level+1) // xp necesario para el siguiente nivel actual del usuario

      if(user.xp >= xpToNextLvl){ //If xp surpased xp for the next level -> LEVEL UP
        user.level++;

        user.xp -= xpToNextLvl;
        hasLeveledUp = true;
      }

      user.lastUpdated = new Date();
      await user.save().catch(e => console.log(`Failed to append xp: ${e}`) );
    }
    return hasLeveledUp;
  }


  /**
  * @param {string} [userId] - Discord user id.
  * @param {string} [guildId] - Discord guild id.
  * @param {boolean} [fetchPosition] - Server leaderboard position.
  */

  static async fetch(userId, guildId, fetchPosition = false) {
    if (!userId) throw new TypeError("An user id was not provided.");
    if (!guildId) throw new TypeError("A guild id was not provided.");

    const user = await levels.findOne({
      userID: userId,
      guildID: guildId
    });
    if (!user) return false;

    if (fetchPosition === true) {
      const leaderboard = await levels.find({ 
        guildID: guildId 
      }).sort([['totalXP', 'descending']]).exec();

      user.position = leaderboard.findIndex(i => i.guildID === guildId && i.userID === userId) + 1;
    }

    return user;
  }


  /**
  * @param {string} [guildId] - Discord guild id.
  * @param {number} [limit] - Amount of maximum enteries to return.
  */

  static async fetchLeaderboard(guildId, limit) {
    if (!guildId) throw new TypeError("A guild id was not provided.");
    if (!limit) throw new TypeError("A limit was not provided.");

    var users = await levels.find({ guildID: guildId }).sort([['totalXP', 'descending']]).exec();

    return users.slice(0, limit);
  }


  /**
  * @param {string} [client] - Your Discord.Client.
  * @param {array} [leaderboard] - The output from 'fetchLeaderboard' function.
  * @param {boolean} [fetchUsers] - Only shows active users on the server.
  */

  static async computeLeaderboard(client, leaderboard, fetchUsers = true) {
    if (!client) throw new TypeError("A client was not provided.");
    if (!leaderboard) throw new TypeError("A leaderboard id was not provided.");
    if (leaderboard.length < 1) return [];

    const computedArray = [];

    if (fetchUsers) { //every member even if they're not in the cache
      for (const key of leaderboard) {
        const user = await client.users.fetch(key.userID)
        computedArray.push({
          guildID: key.guildID,
          userID: key.userID,
          xp: key.xp,
          totalXP: key.totalXP,
          level: key.level,
          position: (leaderboard.findIndex(i => i.guildID === key.guildID && i.userID === key.userID) + 1),
          username(spaces = false, len = 24) {
            if(!spaces) return user.username;
            let name = (user.username.length > len ? user.username.slice(0, 18) + '... ': user.username);
            const many = len + 2 - name.length;
            for(let i = 0; i < many; i++) name+=' ';
            
            const medals = ['🥇', '🥈', '🥉'];
            
            let prename = '';
            if (this.position < 10) prename += ' ';
            if (this.position < 4)  prename += `${medals[this.position - 1]}`;
            return prename + name;
          }
        });
      }
    } else { //only members that are store in the cache
      leaderboard.map(key => computedArray.push({
        guildID: key.guildID,
        userID: key.userID,
        xp: key.xp,
        totalXP: key.totalXP,
        level: key.level,
        position: (leaderboard.findIndex(i => i.guildID === key.guildID && i.userID === key.userID) + 1),
        username: client.guilds.cache.get(key.userID) ? `**${client.guilds.cache.get(key.userID).username}**` : "?",
      }));
    }

    return computedArray;
  }
  
}

module.exports = DiscordXp;
