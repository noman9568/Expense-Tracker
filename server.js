const express = require('express');
const app = express();
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

require('dotenv').config();
const DB_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
mongoose.connect(DB_URI,{
  maxPoolSize: 10,
});

const userD = require('./models/userD');
const userDetails = require('./models/userDetails');
const { hash } = require('crypto');

app.use(express.static('public'));
app.set('view engine','ejs');
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(express.urlencoded({extended : true}));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 10*60*1000}
}));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});




app.get('/',(req,res)=>{
  return res.render('login',{message : ''})
})
app.get('/register',(req,res)=>{
  return res.render('register', { message : '' })
})
app.get('/login',isAuthenticated,(req,res)=>{
  return res.redirect('/');
})



app.post('/register',async (req,res)=>{
  const { name , email, username , password } = req.body;
  const checkUser = await userD.findOne({username : username} , {password : password});
  if(checkUser) {
    return res.render('register',{message : 'User Already exists! Login to continue.'})
  }
  const hashed_password =await hashpassword(password);
  // console.log(hashed_password);
  await userD.create({
    name : name,
    email : email,
    username : username,
    password : hashed_password
  });
  return res.render('register', { message : 'Registered Successfully! Login to continue.'});
})

app.post('/login',async (req,res)=>{
  const {username , password} = req.body;
  req.session.username = username;
  const checkUser = await userD.findOne({ username : username});
  if(checkUser) {
    const check = await matchpassword(password , checkUser.password);
    if(check) {
      console.log('Successfully Logged in.');
      return res.redirect('/home');
    }
    else {
      return res.render('login', {message : 'Incorrect Password!'});
    }
  }
  else {
    return res.render('login',{message : 'User Not found!'});
  }
})
app.get('/home',isAuthenticated,async (req,res)=>{
  const [user , data , finalResult] = await Promise.all([
    userD.findOne({username : req.session.username}),
    fetchData(req.session.username),
    fetchExpense(req.session.username)
  ]);
  const { name } = user;
  return res.render('index', { data, expense : finalResult.totalAmount , name, username : req.session.username , positiveE : finalResult.positive , negativeE : finalResult.negative});
})


app.post('/create',isAuthenticated,async (req,res)=>{
  const { name , amount , description, category } = req.body;
  const username = req.session.username;
  if(description && amount && category) {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;  // Months are 0-indexed
    const day = currentDate.getDate();
    const date = `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
    // console.log(date);
    await userDetails.create({username , name , date , amount , category , description , });
    return res.redirect(`/update/${username}`);
  }
})
app.get('/update/:username',isAuthenticated,async (req,res)=>{
  return res.redirect('/home');
})


app.get('/delete/:id',isAuthenticated,async (req,res)=>{
  const id = req.params.id;
  await userDetails.findOneAndDelete({username : req.session.username , _id : id});
  return res.redirect('/home');
})

app.get('/logout',(req,res)=>{
  req.session.destroy(err=>{
    if(err) {
      return res.redirect('/home');
    }
    else {
      return res.redirect('/');
    }
  })
})

app.post('/filter',isAuthenticated,async (req,res)=>{
  const date = req.body;
  // console.log(date);
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;  // Months are 0-indexed
  const day = currentDate.getDate();
  const date_detail = `${year}-${month < 10 ? '0' + month : month}-${day < 10 ? '0' + day : day}`;
  if(date.date=='Today') {
    const user = await userDetails.find({username : req.session.username , date : date_detail});
    const finalResult = await fetchExpense(req.session.username);
    const data = await user.map(item=>({
      name : item.name,
      amount : item.amount,
      category : item.category,
      description : item.description,
      id : item._id
    }))
    const user1 = await userD.findOne({username : req.session.username});
    const name1 = user1.name;
    return res.render('index', { data: data , expense : finalResult.totalAmount , name : name1 , username : req.session.username , positiveE : finalResult.positive , negativeE : finalResult.negative});
  }
  else{
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const formattedDate = `${sevenDaysAgo.getFullYear()}-${sevenDaysAgo.getMonth() + 1 < 10 ? '0' + (sevenDaysAgo.getMonth() + 1) : (sevenDaysAgo.getMonth() + 1)}-${sevenDaysAgo.getDate() < 10 ? '0' + sevenDaysAgo.getDate() : sevenDaysAgo.getDate()}`;
    // console.log(formattedDate);
    const user = await userDetails.find({
      username: req.session.username,
      date: { $gte: formattedDate }, 
    });
    const data = user.map(item => ({
      name: item.name,
      amount: item.amount,
      category: item.category,
      description: item.description,
      id: item._id,
    }));
    const user1 = await userD.findOne({username : req.session.username});
    const name1 = user1.name;
    const finalResult = await fetchExpense(req.session.username);
    return res.render('index', { data: data , expense : finalResult.totalAmount , name : name1 , username : req.session.username , positiveE : finalResult.positive , negativeE : finalResult.negative});
  }
})
app.get('/reset-filter',isAuthenticated,(req,res)=>{
  return res.redirect(`/update/${req.session.username}`);
})


async function fetchExpense(username) {
  const result = await userDetails.aggregate([
    { $match: { username: username } },
    { $group: { _id: null, totalAmount: { $sum: "$amount" } , positive : { $sum : { $cond :[{ $gte : ["$amount",0]} , "$amount" , 0 ] } },
    negative : { $sum : { $cond :[{ $lt : ["$amount",0]} , "$amount",0 ] } }
   } },
   { $project: { _id: 0, totalAmount: 1, positive: 1, negative: 1 } }
  ]);
  if(result.length>0){
    const finalResult = {totalAmount: result[0].totalAmount , positive : result[0].positive , negative : result[0].negative};
    return  finalResult;
  }
  else {
    const finalResult = {totalAmount: '0' , positive : '0' , negative : '0'};
    return finalResult;
  }
}


async function fetchData(username) {
  const user = await userDetails.find({username : username});
    const data = await user.map(item=>({
      name : item.name,
      amount : item.amount,
      category : item.category,
      description : item.description,
      id : item._id
    }))
    return data;
}


async function hashpassword(password) {
  try {
    const saltrounds = 8;
    const hpassword = await bcrypt.hash(password,saltrounds);
    return hpassword;
  }
  catch(err) {
    console.log('Error Hashing password : ' + err);
  }
}
async function matchpassword(password, hashpassword) {
  try {
    const check = await bcrypt.compare(password,hashpassword);
    if(check) {
      return check;
    }
    else {
      return false;
    }
  }
  catch(err) {
    console.log('Error in matching the password : ' + err);
  }
}

async function isAuthenticated(req,res,next) {
  if(req.session && req.session.username) {
    next();
  }
  else {
    res.redirect('/');
  }
}


app.listen(3000);