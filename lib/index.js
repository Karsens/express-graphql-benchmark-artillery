// 0 - imports

const Sequelize = require('sequelize');
const express = require('express');
const bodyParser = require('body-parser');
const { graphqlExpress, graphiqlExpress } = require('apollo-server-express');
const { makeExecutableSchema } = require('graphql-tools');

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
});

// force: true will drop the table if it already exists
User.sync({ force: true }).then(() =>
  // Table created
  User.create({
    firstName: 'John',
    lastName: 'Hancock',
  }));

// 2 - schema in string-form
const typeDefs = `
  type Query { users: [User] }
  type User { firstName: String, lastName: String, createdAt: String }
`;

// 3 - resolvers
const resolvers = {
  Query: {
    users: () => User.findAll(),
  },
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
