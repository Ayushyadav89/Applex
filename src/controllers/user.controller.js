import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadOnCloudianry} from "../utils/cloudnary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave : false});

        return {accessToken, refreshToken}
    }
    catch(error){
        throw new ApiError(500, "Something went wrong while generating refresh and access Token");
    }
}


// REGISTER USER

const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return response

    const {fullName, email, username, password} = req.body
    // console.log("email:", email);

    // if(fullName == "") {
    //     throw new ApiError(400, "fullnme is required")
    // }

    if(
        [fullName, email, username, password].some((field) => 
            field?.trim() === "")
    ){
        throw new ApiError(400, "fullname is required");
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser) {
        throw new ApiError(409, "Users with email or username already exists");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudianry(avatarLocalPath)
    const coverImage = await uploadOnCloudianry(coverImageLocalPath)

    if(!avatar) {
        throw new ApiError(400, "Avatar45 file is required");
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username : username.toLowerCase()
    })

    const createUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createUser) {
        throw new ApiError(500, "Something went wrong while creating an User");
    }

    return res.status(201).json(
        new ApiResponse(200, createUser, "User registed Successfully")
    )

})


// Login User
const loginUser = asyncHandler(async (req, res) => {
    // req body - data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send cookie 

    const {email, username, password} = req.body


    if(!(username || email)) {
        throw new ApiError(400, "username or email is required");
    }

    const user = await User.findOne({
        $or: [{username}, {email}] 
    })

    if(!user) {
        throw new ApiError(404, "User doesn't exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid) {
        throw new ApiError(401, "Password incorrect");
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const option = {
        httpOnly : true,
        secure : true
    }

    return res
    .status(200)
    .cookie("acessToken", accessToken, option)
    .cookie("refreshToken", refreshToken, option)
    .json(
        new ApiResponse(
            200,
            {
                user : loggedInUser,accessToken, refreshToken           
            },
            "User looged in successfully"
        )
    )

})


// Logout User
const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken : undefined
            }
        },
        {
            new: true
        }
    )

    const option = {
        httpOnly : true,
        secure : true
    }

    return res
    .status(200)
    .clearCookie("acessToken", option)
    .clearCookie("refreshToken", option)
    .json(new ApiResponse(200, {}, "User Logged out successfully"))
})


const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken) {
        throw new ApiError(404, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user) {
            throw new ApiError(404, "Invalid Refresh Token")
        }
    
        if(incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        const option = {
            httpOnly : true,
            secure : true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshToken(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})


// Change current password
const changeCurrentPassword = asyncHandler(async (req, res) => {
    const {oldPassword, newPassword, confirmPassword} = req.body;

    if(!(newPassword === confirmPassword)) {
        throw new ApiError(400, "New Password is not matched with confirm Password")
    }

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old Password");
    }

    user.password = newPassword
    await user.save({validateBeforeSave : false})

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed Successfully"));
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"));
})


const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullName, email} = req.body

    if(!fullName || !email) {
        throw new ApiError(400, "All fields are required")
    }

    const user  = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName : fullName,
                email : email
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))
})


const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudianry(avatarLocalPath)

    if(!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user  = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                avatar : avatar.url
            }
        },
        {
            new : true
        }
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar Image updated successfully"))
})


const updateUserCoverImage = asyncHandler(async (req, res) => {
    const CoverImageLocalPath = req.file?.path

    if(!CoverImageLocalPath) {
        throw new ApiError(400, "Cover Image file is missing")
    }

    const CoverImage = await uploadOnCloudianry(CoverImageLocalPath)

    if(!CoverImage.url) {
        throw new ApiError(400, "Error while uploading on Cover Image")
    }

    const user  = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                CoverImage : CoverImage.url
            }
        },
        {
            new : true
        }
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover Image updated successfully"))
})


const getUserChannelProfile = asyncHandler(async (req, res) => {
    const {username} = req.params

    if(!username?.trim()) {
        throw new ApiError(400, "username is missing")
    }

    const channel = await User.aggregate([
        {
            $match: {
                username:username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    if (!channel?.length) {
        throw new ApiError(404, "channel does not exists")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: "users",
                        localField: "owner",
                        foreignField: "_id",
                        as: "owner",
                        pipeline: [
                            {
                                $project: {
                                    fullName: 1,
                                    username: 1,
                                    avatar: 1
                                }
                            }
                        ]
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}