// 0 - imports

const Sequelize = require('sequelize');
const express = require('express');
const bodyParser = require('body-parser');
const { graphqlExpress, graphiqlExpress } = require('apollo-server-express');
const { makeExecutableSchema } = require('graphql-tools');
const blocked = require('blocked');
const os = require('os-utils');

import { GraphQLScalarType } from 'graphql';
import { Kind } from 'graphql/language';

const Debug = {
  blocking: true,
};
// 1 - connectors

const sequelize = new Sequelize('database', 'username', 'password', {
  host: 'localhost',
  dialect: 'sqlite', // 'mysql'|'sqlite'|'postgres'|'mssql',

  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },

  // application wide model options
  define: {
    // timestamps: false // true by default
  },

  // SQLite only
  storage: 'db.sqlite',
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

const User = sequelize.define('user', {
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
});

const Message = sequelize.define('message', {
  text: {
    type: Sequelize.STRING,
  },
});

Message.belongsTo(User);
User.hasMany(Message);

// force: true will drop the table if it already exists
User.sync({ alter: true });
Message.sync({ alter: true });

// 2 - schema in string-form
const typeDefs = `
scalar Date 

type Mutation {
  createUser(firstName: String, lastName: String): User
  createMessage(userId: Int, text:String): Message
}

type Query { 
  users: [User]
  user(id: Int): User
  serverStatus: ServerStatus
  messages(userId: Int): [Message]
}

type User { 
  id: Int,
  firstName: String, 
  lastName: String, 
  fullName: String,
  secret: String,
  createdAt: Date,
  updatedAt: Date,
  lastMessage: Date
}

type Message {
  id: Int,
  text: String,
  userId: Int,
  user: User,
  createdAt: Date,
}

type ServerStatus {
  cpus: Int
  totalmem: Int
  freemem: Int
}
`;

// 3 - resolvers
const resolvers = {
  Query: {
    users: (_, { auth }) => User.findAll(),

    user: (_, { id }) => User.findOne({ where: { id } }),

    messages: (_, { userId }) => Message.findAll({ where: { userId }, include: [User] }),

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
    createUser: (_, { firstName, lastName }) =>
      User.create({
        firstName,
        lastName,
      }),

    createMessage: (_, { userId, text }) =>
      User.update({ lastMessage: Date.now() }, { where: { id: userId } })
        .then((result) => {
          if (result[0] === 1) {
            return Message.create({
              userId,
              text,
            });
          }
        })
        .catch(e => console.log(e)),
  },

  User: {
    firstName: props => `Gekke ${props.firstName}`,
    fullName: props => `Dhr./Mv. ${props.firstName} je-boy ${props.lastName}`,
    secret: (props, _, __) => {
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
  console.log('Go to http://localhost:3000/graphql in the GraphiQL program, to run queries!');
});

blocked((ms) => {
  if (Debug.blocking) {
    console.log('blocked for %sms', ms | 0);
  }
});
