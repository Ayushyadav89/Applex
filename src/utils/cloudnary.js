import {v2 as cloudinary} from "cloudinary"
import fs from "fs"

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.LOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET 
});

const uploadCloudianry = async (localFilePath) => {
    try {
        if(!localFilePath) {
            return null
        }
        // upload the file on cloudanary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type : "auto"
    })
    // file has been succesfully upload
    console.log("file is upload on cloudinary", response.url);
    return response
    }
    catch(error) {
        fs.unlinkSync(localFilePath)  // remove the locally saved temporary file as the upload operation got failed

    }
}

export {uploadCloudianry}