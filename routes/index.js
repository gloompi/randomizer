const { createClient } = require('redis');
const express = require('express');
const router = express.Router();

const MEMBERS_QUEUE = 'MEMBERS';
const VISITED_LIST = 'VISITED';
const CHANGE_REQUESTED = 'CHANGE';

const init = async () => {
  const {
    REDIS_USER,
    REDIS_PASSWORD,
    REDIS_URL,
    // REDIS_API_KEY,
  } = process.env;
  const client = createClient({
    url: `redis://${REDIS_USER}:${REDIS_PASSWORD}@${REDIS_URL}`
  });

  client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect();

  /* GET home page. */
  router.get('/', async (req, res, next) => {
    const visitors = await client.get(VISITED_LIST);
    const parsedVisitors = visitors ? JSON.parse(visitors) : {};
    const changed = await client.get(CHANGE_REQUESTED);
    const parsedChanged = changed ? JSON.parse(changed) : {};
    const userId = `${req.ip}:${req.get('User-Agent')}`;

    if (parsedVisitors[userId]) {
      res.render('index', { person: parsedVisitors[userId], changed: Boolean(parsedChanged[userId]) });
    } else {
      const list = JSON.parse(await client?.get(MEMBERS_QUEUE));
      const name = list[Math.floor(Math.random()*list.length)];
      const newList = list.filter((item) => item !== name);
      await client.set(MEMBERS_QUEUE, JSON.stringify(newList));

      parsedVisitors[userId] = name;
      await client.set(VISITED_LIST, JSON.stringify(parsedVisitors));

      res.render('index', { person: name, changed: Boolean(parsedChanged[userId]) });
    }
  });

  router.get('/regenerate', async (req, res) => {
    const visitors = await client.get(VISITED_LIST);
    const parsedVisitors = visitors ? JSON.parse(visitors) : {};
    const changed = await client.get(CHANGE_REQUESTED);
    const parsedChanged = changed ? JSON.parse(changed) : {};
    const userId = `${req.ip}:${req.get('User-Agent')}`;

    if (!parsedChanged[userId] && parsedVisitors[userId]) {
      const list = JSON.parse(await client?.get(MEMBERS_QUEUE));
      const name = list[Math.floor(Math.random()*list.length)];
      const newList = list.filter((item) => item !== name);
      newList.push(parsedVisitors[userId]);

      await client.set(MEMBERS_QUEUE, JSON.stringify(newList));

      parsedVisitors[userId] = name;
      await client.set(VISITED_LIST, JSON.stringify(parsedVisitors));

      parsedChanged[userId] = true;
      await client.set(CHANGE_REQUESTED, JSON.stringify(parsedChanged));

      res.render('index', { person: parsedVisitors[userId], changed: true });
    } else {
      res.redirect('/');
    }
  })

  router.get('/list', async (req, res) => {
    const list = await client?.get(MEMBERS_QUEUE) ?? '[]';
    res.render('list', { members: JSON.parse(list) });
  });

  router.get('/reset', async (req, res) => {
    await client.del(MEMBERS_QUEUE);
    res.redirect('/list');
  });

  router.get('/clean', async (req, res) => {
    await client.del(VISITED_LIST);
    await client.del(CHANGE_REQUESTED);
    res.redirect('/list');
  });

  router.post('/list', async (req, res) => {
    const { name } = req.body;

    if (name) {
      const list = await client?.get(MEMBERS_QUEUE);

      if (!list) {
        await client.set(MEMBERS_QUEUE, JSON.stringify([name]));
      } else {
        const parsedList = JSON.parse(list);
        parsedList.push(name);
        await client.set(MEMBERS_QUEUE, JSON.stringify(parsedList));
      }

      const members = await client.get(MEMBERS_QUEUE);

      res.json({
        status: 'ok',
        value: members,
      });
    } else {
      res.status('400');
      res.send('Please provide name');
    }
  });
}

init();

module.exports = router;
