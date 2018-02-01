// 0 - imports
// to find all mysql commands: cd /usr/local/mysql , this symlink gets created on mysql installation
/*
sudo launchctl list | grep -i mysql
geeft:
23955	0	com.oracle.oss.mysql.mysqld

root@localhost -p hoihoi33
ssh root@172.104.228.7
conclusie: raw mysql is 2x zo snel als sequelize sql qua response time. gek genoeg is het cpu gebruik wel het zelfde.

*/
const Sequelize = require('sequelize');
const express = require('express');
const bodyParser = require('body-parser');
const { graphqlExpress, graphiqlExpress } = require('apollo-server-express');
const { makeExecutableSchema } = require('graphql-tools');
const blocked = require('blocked');
const os = require('os-utils');

// raw mysql
const mysql = require('mysql2/promise');

// get the client
import { GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language';

const mode = process.env.NODE_ENV;
const ORM = true;

const Debug = {
  blocking: false,
  sql: false,
};
// 1 - connectors

const database = 'artillery';
const user = 'root';
const host = 'localhost';
const password = 'hoihoi33';
const dialect = 'mysql'; // sqlite

const pool = {
  max: 10000,
  min: 0,
  acquire: 30000,
  idle: 10000,
};

const settings = {
  host,
  user,
  password,
  database,
};

/*
Install typescript

type Model = {
  type: string,
  dbName: string,
  dbFields: sequelize.DefineAttributes,
  dbOptions: sequelize.DefineOptions,
};

let Model: Array<Model>;
*/

const Model = new Array();

Model.User = {
  type: `type User { 
    id: Int,
    firstName: String, 
    lastName: String, 
    fullName: String,
    secret: String,
    lastMessage: Date
  }`,
  dbName: 'user',
  dbFields: {
    firstName: {
      type: Sequelize.STRING,
    },
    lastName: {
      type: Sequelize.STRING,
    },
    lastMessage: {
      type: Sequelize.DATE,
    },
    secret: {
      type: Sequelize.STRING,
      defaultValue: 'Ik ben een meisje',
    },
  },
  dbOptions: { timestamps: false },
};

Model.Message = {
  type: `type Message {
      id: Int,
      text: String,
      userId: Int,
      user: User,
    }`,
  dbName: 'message',
  dbFields: {
    text: {
      type: Sequelize.STRING,
    },
  },
  dbOptions: { timestamps: false },
};

Model.ServerStatus = {
  type: `
  type ServerStatus {
    cpus: Int
    totalmem: Int
    freemem: Int
  }`,
};

// create the connection to database

const sequelize = new Sequelize(database, user, password, {
  host,
  dialect, // 'mysql'|'sqlite'|'postgres'|'mssql',
  pool,
  // storage: 'db.sqlite' --sqlite only
  logging: Debug.sql ? console.log : false,
  operatorsAliases: false,
});

sequelize
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
  });


//for each model in the Model Array, run sequelize define. put models in M
//if auto-migration is set to true...
//1) dump the whole database on restart
//2) for each Model in M, call function sync with alter true on it.


const User = sequelize.define(Model.User.dbName, Model.User.dbFields, Model.User.dbOptions);

const Message = sequelize.define(
  Model.Message.dbName,
  Model.Message.dbFields,
  Model.Message.dbOptions,
);

// force: true will drop the table if it already exists
User.sync({ alter: true });
Message.sync({ alter: true });

// 2 - schema in string-form
const typeDefs = `
scalar Date 

type Mutation {
  createUser(raw: Boolean, firstName: String, lastName: String): User
  createMessage(raw:Boolean, userId: Int, text:String): Message
}

type Query { 
  users(raw: Boolean): [User]
  user(raw: Boolean, id: Int): User
  serverStatus: ServerStatus
  messages(raw: Boolean, userId: Int): [Message]
}

${Model.User.type}
${Model.Message.type}
${Model.ServerStatus.type}
`;

let connection = (async function () {
  try {
    connection = await mysql.createConnection(settings);
  } catch (err) {
    console.error(err);
  }
}());

const subQuery = query => connection.execute(query);

const query = query =>
  subQuery(query)
    .then(([rows, fields]) => rows)
    .catch(e => console.log(e));

// 3 - resolvers
const resolvers = {
  Query: {
    users: async (_, { raw, auth }) =>
      (raw
        ? query('SELECT * FROM users LIMIT 0,100') // SELECT `id`, `firstName`, `lastName`, `lastMessage`, `secret`, `createdAt`, `updatedAt` FROM `users` AS `user` LIMIT 100;
        : User.findAll({ limit: 100 })
          .then(res => res)
          .catch(e => console.log(e))),

    user: (_, { raw, id }) =>
      (raw
        ? query(`SELECT * FROM users WHERE id=${id}`) // SELECT `id`, `firstName`, `lastName`, `lastMessage`, `secret`, `createdAt`, `updatedAt` FROM `users` AS `user` WHERE `user`.`id` = 1;
        : User.findOne({ where: { id } })
          .then(res => res)
          .catch(e => console.log(e))),

    messages: (_, { raw, userId }) =>
      (raw
        ? query(`SELECT * FROM messages WHERE userId = ${userId} ORDER BY id DESC LIMIT 50`) // SELECT `id`, `text`, `createdAt`, `updatedAt`, `userId` FROM `messages` AS `message` WHERE `message`.`userId` = 1 ORDER BY `message`.`id` DESC LIMIT 50
        : Message.findAll({ where: { userId }, order: [['id', 'DESC']], limit: 50 })
          .then(res => res)
          .catch(e => console.log(e))),

    serverStatus: () => {
      // SERVER LOAD FLEXIBILITY FEEDBACK LOOP
      // onst cpus = os.cpus();
      const avg = Math.round(os.loadavg(1));
      const totalmem = Math.round(os.totalmem());
      const freemem = Math.round(os.freemem());

      /*
      for (var i = 0, len = cpus.length; i < len; i++) {
        console.log("CPU %s:", i);
        var cpu = cpus[i],
          total = 0;

        for (var type in cpu.times) {
          total += cpu.times[type];
        }

        for (type in cpu.times) {
          console.log("\t", type, Math.round(100 * cpu.times[type] / total));
        }
        console.log("\t", "total", total);
      }
      */

      console.log(`avg cpu usage: ${avg}`);
      console.log(`totalmem: ${totalmem}`);
      console.log(`freemem: ${freemem}`);

      // These stats should be checked. if the server is on high load, like over 80% on one of these, the server status will cause some functionalities to be turned off immedeately.
      // It will be great if the client also knows the CPU usage. if it's high, change the amount of requests to send to the server. For example, disable auto-refresh and show 'refresh' buttons.
      // If it's low, improve instantness! Just refresh chat every 500ms, for example.
      // If I have this, the app should be available for up to 1000 requests per second or so. This means that it should be able to handle 100k users at once if it's really efficient and puts queries in a qeue or so. Should be doable!

      const serverStatus = { cpus: avg, totalmem, freemem };
      return serverStatus;
    },
  },

  Mutation: {
    createUser: (_, { raw, firstName, lastName }) =>
      (raw
        ? query(`INSERT INTO users (firstName, lastName) VALUES ('${firstName}','${lastName}')`) // INSERT INTO `users` (`id`,`firstName`,`lastName`,`secret`,`createdAt`,`updatedAt`) VALUES (DEFAULT,'Wijnandje','K','Ik ben een meisje','2018-01-18 13:11:52','2018-01-18 13:11:52');
        : User.create({
          firstName,
          lastName,
        })
          .then(res => res)
          .catch(e => console.log(e))),

    createMessage: (_, { raw, userId, text }) =>
      (raw
        ? query(`INSERT INTO messages (userId, text) VALUES ('${userId}','RAW ${text} RAW')`) // INSERT INTO `messages` (`id`,`text`,`createdAt`,`updatedAt`,`userId`) VALUES (DEFAULT,'doei pro','2018-01-18 13:10:50','2018-01-18 13:10:50',1);
        : Message.create({ userId, text })
          .then(res => res)
          .catch(e => console.log(e))),
  },

  User: {
    firstName: (obj,args,context,query) => `Gekke ${obj.firstName}`,
    fullName: props => `Dhr./Mv. ${props.firstName} ${props.lastName}`,
    secret: (props) => {
      if (props.secret) {
        return props.secret;
      }
      return 'Geen geheim';
    },
  },

  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    parseValue(value) {
      return new Date(value); // value from the client
    },
    serialize(value) {
      return value.getTime(); // value sent to the client
      // make sure value is a date!
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return parseInt(ast.value, 10); // ast value is always in string format
      }
      return null;
    },
  }),
};
// 4 - server execution

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

const app = express();

// The GraphQL endpoint
app.use('/graphql', bodyParser.json(), graphqlExpress({ schema }));

// Start the server
app.listen(3000, () => {
  console.log(`Running on http://localhost:3000/graphql, on mode ${mode}`);
});

blocked((ms) => {
  if (Debug.blocking) {
    console.log('blocked for %sms', ms | 0);
  }
});
