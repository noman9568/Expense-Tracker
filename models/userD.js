const mongoose = require('mongoose');

let userD = mongoose.Schema({
  name : String,
  email : String,
  username : String, 
  password : String
});

module.exports = mongoose.model('userD',userD);

