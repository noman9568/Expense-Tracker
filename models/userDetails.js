const mongoose = require('mongoose');

const userDetails = mongoose.Schema({
  username : String,
  name: String,
  date : Object,
  amount : Number,
  category : String,
  description: String
})

module.exports = mongoose.model('userDetails',userDetails);

