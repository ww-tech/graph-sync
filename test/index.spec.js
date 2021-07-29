import GraphSync from '..'
import pg from 'pg'
import pgSetup from '@databases/pg-test/jest/globalSetup'
import pgTeardown from '@databases/pg-test/jest/globalTeardown'
import test from 'ava'
import fs from 'fs'

let pgPool
let graphSync

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

test.before(async function () {
  await pgSetup()
  await wait(1000)
  pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  graphSync = new GraphSync({ pgPool })
  const sql = fs.readFileSync(`${__dirname}/fixtures.sql`, 'utf8')
  await graphSync.pgQuery(sql)
})

test.serial('registerTable', async t => {
  await graphSync.registerTable({
    tableName: 'authors',
    getLabels: () => ['Person', 'Author'],
    getProperties: row => row
  })
  await graphSync.registerTable({
    tableName: 'books',
    getLabels: () => ['Book'],
    getProperties: row => ({ id: row.id, title: row.title }),
    getRelationships: row => (['(this)-[:HAS_AUTHOR]->(author)'])
  })
  t.deepEqual(graphSync.tables.books.primaryKey, ['id'])
  t.is(graphSync.tables.books.foreignKeys.author.foreignTable, 'authors')
  t.deepEqual(graphSync.tables.books.getLabels(), ['Book'])
})

// TODO: consider this alternate syntax for defining relationships
test.skip('registerTable alternate syntax', async t => {
  await graphSync.registerTable({
    tableName: 'novels',
    getLabels: () => ['Novel'],
    getProperties: row => ({ id: row.id, title: row.title }),
    getRelationships: row => ([{
      from: 'this',
      to: 'author',
      relType: 'HAS_AUTHOR'
    }])
  })
  t.deepEqual(graphSync.tables.novels.primaryKey, ['id'])
  t.is(graphSync.tables.novels.foreignKeys.author.foreignTable, 'authors')
  t.deepEqual(graphSync.tables.novels.getLabels(), ['Novel'])
})

test.serial('generateNode single label', async t => {
  const row = await graphSync.findOne('books', { id: 2 })
  const cypher = await graphSync.generateNode('books', row)
  t.is(cypher, "MERGE (:Book {id: 2, title: 'The Great Gatsby'});")
})

test.serial('generateNode multiple labels', async t => {
  const row = await graphSync.findOne('authors', { id: 1 })
  const cypher = await graphSync.generateNode('authors', row)
  t.is(cypher, "MERGE (:Person:Author {id: 1, name: 'F. Scott Fitzgerald'});")
})

test.serial('generateRelationships', async t => {
  const row = await graphSync.findOne('books', { id: 2 })
  const cypher = await graphSync.generateRelationships('books', row)
  t.is(cypher, "MATCH (this:Book), (author:Person:Author) WHERE this.id = '2' AND author.id = '1' MERGE (this)-[:HAS_AUTHOR]->(author);")
})

test.after(() => {
  pgTeardown()
})