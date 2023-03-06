const User = require('../models/user')
const BigPromise = require('../middlewares/bigPromise')
const CustomError = require('../utils/customError')
const cookieToken = require('../utils/cookieToken')
const cloudinary = require('cloudinary')
const mailHelper = require('../utils/emailHelper')
const crypto = require('crypto')

exports.signup = BigPromise(async (req, res, next) => {
    
    if (!req.files) {
        return next(new CustomError("photo is required for signup", 400));
    }
    
    const { name, email, password } = req.body;
    
    if (!email || !name || !password) {
        return next(new CustomError("Name, email and password are required", 400));
    }
    
    let file = req.files.photo;

    const result = await cloudinary.v2.uploader.upload(file.tempFilePath, {
    folder: "users",
    width: 150,
    crop: "scale",
    });

    const user = await User.create({
        name,
        email,
        password,
        photo:{
            id: result.public_id,
            secure_url: result.secure_url
        }
    })

    cookieToken(user, res);
});

exports.login = BigPromise(async (req, res, next) => {
    const {email, password}  =  req.body

    //check for presence of email and password
    if (!email || !password) {
        return next (new CustomError('please provide email and password', 400))
    }

    //get user from db
    const user = await User.findOne({email}).select("+password")

    //if user not found in db
    if (!user) {
        return next (new CustomError('email or password doesnot match or exists', 400))
    }

    //match the pwd 
    const isPasswordCorrect = await user.isValidatedPassword(password)

    //if pwd do not match
    if (!isPasswordCorrect) {
        return next (new CustomError('email or password doesnot match or exists', 400))
    }

    //if all goes good we send token
    cookieToken(user, res);
});

exports.logout = BigPromise(async (req, res, next) => {
    res.cookie('token', null, {
        expires: new Date(Date.now()),
        httpOnly: true
    })
    res.status(200).json({
        success: true,
        messgae:"log out successful"
    })
});

exports.forgotPassword = BigPromise(async (req, res, next) => {
    // collect email
    const { email } = req.body;
  
    // find user in database
    const user = await User.findOne({ email });
  
    // if user not found in database
    if (!user) {
      return next(new CustomError("Email not found as registered", 400));
    }
  
    //get token from user model methods
    const forgotToken = user.getForgotPasswordToken();
  
    // save user fields in DB
    await user.save({ validateBeforeSave: false });
  
    // create a URL
    const myUrl = `${req.protocol}://${req.get(
      "host"
    )}/api/v1/password/reset/${forgotToken}`;
  
    // craft a message
    const message = `Copy paste this link in your URL and hit enter \n\n ${myUrl}`;
  
    // attempt to send email
    try {
      await mailHelper({
        email: user.email,
        subject: "Password reset email",
        message,
      });
  
      // json reponse if email is success
      res.status(200).json({
        succes: true,
        message: "Email sent successfully",
      });
    } catch (error) {
      // reset user fields if things goes wrong
      user.forgotPasswordToken = undefined;
      user.forgotPasswordExpiry = undefined;
      await user.save({ validateBeforeSave: false });
  
      // send error response
      return next(new CustomError(error.message, 500));
    }
});
  
exports.passwordReset = BigPromise(async (req, res, next) => {
    const token = req.params.token

    const encryToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

    const user = await User.findOne({
        encryToken, 
        forgotPasswordExpiry: {$gt: Date.now()}
    })

    if(!user){
        return next(new CustomError('token is invalid or expired', 400))
    }

    if (req.body.password !== req.body.confirmPassword) {
        return next(new CustomError('password and confirm password do not match', 400))
    }

    user.password = req.body.password

    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;

    await user.save()

    // /send a json repsons eor send token

    cookieToken(user, res);
});

exports.getLoggedInUserDetails = BigPromise(async (req, res, next) => {
    
    const user = await User.findById(req.user.id)

    res.status(200).json({
        success: true,
        user
    })

});

exports.changePassword = BigPromise(async (req, res, next) => {
    
   const userId = req.user.id

   const user = await User.findById(userId).select("+password")
   
   const IsCorrectOldPassword = await user.isValidatedPassword(req.body.oldPassword)
    
   if (!IsCorrectOldPassword) {
        return next(new CustomError('old password is incorrect', 400))
   }

    user.password = req.body.password

    await user.save()
    cookieToken(user, res);
});

exports.updateUserDetails = BigPromise(async (req, res, next) => {
    //add a check for email and name in body
    const newData = {
        name : req.body.name,
        email: req.body.email
    };
    
    if(req.files){
        const user = await User.findById(req.user.id)
        
        const imageId = user.photo.id
        
        //delete photo on cloudinary
        const response = await cloudinary.v2.uploader.destroy(imageId)

        //upload new photo
        const result = await cloudinary.v2.uploader.upload(req.files.photo.tempFilePath, {
            folder: "users",
            width: 150,
            crop: "scale",
        });

        newData.photo = {
            id: result.public_id,
            secure_url: result.secure_url
        }

    }

    const user = await User.findByIdAndUpdate(req.user.id, newData,{
        new: true,
        runValidators: true,
        useFindAndModify: false
    })
    
    res.status(200).json({
        success: true,

    })

});

exports.adminAllUsers = BigPromise(async (req, res, next) => {

    const users = await User.find()
    
    res.status(200).json({
        succes: true,
        users,
    })

});

exports.adminGetOneUser = BigPromise(async (req, res, next) => {
   const user = await User.findById(req.params.id) 

    if (!user) {
        next(new CustomError("no user found", 400))
    }

    res.status(200).json({
        success: true,
        user
    })

});

exports.adminUpdateOneUserDetails = BigPromise(async (req, res, next) => {
    //add a check for email and name in body
    const newData = {
        name : req.body.name,
        email: req.body.email,
        role: req.body.role
    };
    


    const user = await User.findByIdAndUpdate(req.params.id, newData,{
        new: true,
        runValidators: true,
        useFindAndModify: false
    })
    
    res.status(200).json({
        success: true,

    })

});

exports.adminDeleteOneUser = BigPromise(async (req, res, next) => {
    
   const user = await User.findById(req.params.id)

    if (!userreturn ) {
        return next (new CustomError('no such user found', 401))
    }

    const imageId = user.photo.id

    await cloudinary.v2.uploader.destroy(imageId)

    await user.remove()

    res.status(200).json({
        succes: true
    })

});

exports.managerAllUsers = BigPromise(async (req, res, next) => {

    const users = await User.find({role:'user'})
    
    res.status(200).json({
        succes: true,
        users,
    })

});













