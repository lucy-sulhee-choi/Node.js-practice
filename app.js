require("dotenv").config();
const http = require("http");
const fs = require("fs");
const formidable = require("formidable");
const path = require("path");

const API_KEY_MOVIE = process.env.OMDb_API_KEY;
const API_KEY_STREAMING = process.env.STREAMING_API_KEY;
const MOVIE_API_BASE = "http://www.omdbapi.com/?apikey=";
const POSTER_API_BASE = "http://img.omdbapi.com/?apikey=";

////MOVIES////

//fetch movie data from OMDb API for the specified movie title
async function moviesByTitle(movieTitle) {
  try{      
    const response = await fetch(`${MOVIE_API_BASE}${API_KEY_MOVIE}&s=${movieTitle}`);
    const data = await response.json();
    return data;
  } 
  catch(error){
    console.error(error.message + "Error fetching the data");
  };
};

//fetch movie data from OMDb API with the specified imdbID and combine the data with the streaming information from streaming info API.
async function movieByImdbID(imdbID){
  const url = `https://streaming-availability.p.rapidapi.com/v2/get/basic?country=au&imdb_id=${imdbID}&output_language=en`;
  const options = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': API_KEY_STREAMING,
      'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com'
    }
  };
  try {
	  const response_streaming = await fetch(url, options);
	  const result_streaming = await response_streaming.json();
    
    const response_movie = await fetch(`${MOVIE_API_BASE}${API_KEY_MOVIE}&i=${imdbID}`);
    const result_movie = await response_movie.json();
  
    //if both return errors, set data's details and streamingInfo with error message.
   if (result_movie.Error === "Incorrect IMDb ID." && result_streaming.message === "Not Found"){
      const data = {
        "details": {"Response" : "False", "Error" : "Incorrect IMDb ID."},
        "streamingInfo": {"error" : true, "message" : "{\"message\":\"You are not subscribed to this API.\"}"}
      };
      return data;
    }
    //if movie's data exists but no streaming info is available, then set streamingInfo with error message.
    else if (result_streaming.message === "Not Found" || Object.keys(result_streaming.result.streamingInfo).length === 0){
      const data = {
        "details": result_movie, 
        "streamingInfo": {"error" : true, "message" : "{\"message\":\"You are not subscribed to this API.\"}"}
      };
      return data;
    } 
    //If both return valid data, set details and streamingInfo with each data 
    else {
      const data = {
        "details": result_movie, 
        "streamingInfo": result_streaming.result.streamingInfo.au
      };
      return data;
    };	   
  } 
  catch (error) {
    console.error(error.message + "Error fetching the data");
  };
};

//set correct headers according to the data's details.
async function movie(res, input, type){  
  try {
    let data;
    if (type === 'title') {
      data = await moviesByTitle(input);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      });
    } 
    else if (type === 'imdbID'){
      data = await movieByImdbID(input); 
      if (data.details.Response === "False" && data.streamingInfo.error === true){
        res.writeHead(403, "OK", {
          "Content-Type": "application/json",
          "Response":"False",
          "Error":"Movie not found. Invalid input"
        });
      }
      else if (data.streamingInfo.error ===true){
        res.writeHead(403, "OK",{
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
      } 
      else {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
      };
    };
    res.write(JSON.stringify(data));
    res.end();
  } 
  catch (error) {
    console.error(error.message);
    res.writeHead(500, {
      "error": true,
      "message": "The remote detail server returned an invalid response"
    });
    res.end();
  };
}

////POSTERS////

//***GET***//
//fetch movie poster from OMDb API with the specified imdbID.
async function getPoster(imdbID) {
  try {      
    const response = await fetch(`${POSTER_API_BASE}${API_KEY_MOVIE}&i=${imdbID}`);
    const contentType = response.headers.get("content-type");

    if (response.status === 200 && contentType && contentType.includes("image/jpeg")) {
      const imageBuffer = await response.arrayBuffer();
      return imageBuffer;
    }
    else if(response.status === 404 && contentType.includes("text/html")) {
      return {"error" : true, "message" : "No poster image found"};
    }
    else {
      throw new Error("Failed to fetch poster image");
    }
  } catch (error) {
    console.error("Error fetching the image", error.message);
  };
};

//***POST***//
//parse the incoming form data, read and write the fileData to the finalPath.
async function addPoster(req, imdbID) {
  const form = new formidable.IncomingForm();
  try {
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ files });
        };
      });
    });

    if (!files.poster && imdbID === "") {
      const data = { error: true, message: "No poster file found and no poster ID provided" };
      return data;
    }
    else if (imdbID === "") {
      const data = { error: true, message: "No poster ID provided" };
      return data;
    }
    else if (!files.poster){
      const data = { error: true, message: "No poster file found" };
      return data;
    }

    const fileData = fs.readFileSync(files.poster.filepath);
    const finalPath = path.join("./posters", `${imdbID}.jpg`);
    
    fs.writeFileSync(finalPath, fileData);
    const data = { error: false, message: `Poster (${imdbID}.jpg) uploaded successfully` };
    return data;
  } 
  catch (err) {
    console.error(err.message);
    const data = { error: true, message: "Failed to save the poster file" };
    return data;
  };
};

//set correct headers according to the data's details.
async function poster(req, res, input, type) {  
  if (type === 'search') {
    try {
      const data = await getPoster(input);
      if (data.error === true){
        res.writeHead(500, "OK", { "Content-Type": "application/json" });
        res.write(JSON.stringify(data));
        res.end();
      }
      else{
        res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Access-Control-Allow-Origin": "*"
        });
        res.write(Buffer.from(data));
        res.end();
      }
    } catch (error) {
      console.error(error.message);
    };
  }
  else if (type === 'upload') {
    try {
      const data = await addPoster(req, input);
      if (data.error === false) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
      } 
      else {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
      };
      res.write(JSON.stringify(data));  
      res.end();
    } 
    catch (err) {
      console.error(err);
    }
  } 
};

//routing by request url and method.
function routing(req, res) {
  const url = req.url;
  const method = req.method;
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (url.startsWith("/movies/search") && method === "GET") {
    const movieTitle = url.substring("/movies/search/".length);
    if (movieTitle){
      movie(res, movieTitle, "title");
    }
    //If there is no user input of title, set the error message and status code 400.
    else {
      res.writeHead(400, {"Content-Type": "application/json"})
      res.write(JSON.stringify({"error":true, "message":"You must supply a title."}))
      res.end();
    };
  } 
  else if (url.startsWith("/movies/data")&& method === "GET"){
    const imdbID = url.substring("/movies/data/".length);
    if (imdbID){
      movie(res, imdbID, "imdbID");
    }
    //If there is no user input of imdbID, set the error message and status code 400.
    else {
      res.writeHead(400, {"Content-Type": "application/json"})
      res.write(JSON.stringify({"error":true, "message":"You must supply an imdbID."}))
      res.end();
    };
  }
  else if (url.startsWith("/posters/") && method === "GET"){
    const imdbID = url.substring("/posters/".length);
    if (imdbID) {
      poster(req,res,imdbID,"search")
    }
    else{
      res.writeHead(400, {"Content-Type": "application/json"})
      res.write(JSON.stringify({"error":true, "message":"You must supply an imdbID."}))
      res.end();
    };  
  }
  else if (url.startsWith("/posters/add/") && method === "POST") {
    const imdbID = url.substring("/posters/add/".length);
    poster(req,res,imdbID,"upload");
  }
  else {
    //No page matched the url
    res.writeHead(404, "Not Found", {"Content-Type": "application/json"});
    res.write(JSON.stringify({"message": "Route not found"}));
    res.end();
  };
};

http.createServer(routing).listen(4000, function () {
  console.log("server start at port 4000");
});

