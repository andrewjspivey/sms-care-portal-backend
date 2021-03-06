import express from 'express';
import { hash, compare } from 'bcrypt';
import { Coach, ICoach } from '../models/coach.model';
import auth from '../middleware/auth';
import errorHandler from './error';
import {
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
} from './coach.util';
import mongoose from 'mongoose';
import { Patient } from '../models/patient.model';
import { ObjectId } from 'mongodb';


const router = express.Router();

const saltRounds = 10;

// create new coach
router.post('/signup', auth, async (req, res) => {
  const { firstName } = req.body;
  const { lastName } = req.body;
  const emailRaw = req.body.email;
  const emailLower = emailRaw.toLowerCase();
  const { password } = req.body;

  if (await Coach.findOne({ email:emailLower })) {
    return errorHandler(res, 'User already exists.');
  }

  // hash + salt password
  return hash(password, saltRounds, (err, hashedPassword) => {
    if (err) {
      return errorHandler(res, err.message);
    }
    const newCoach = new Coach({
      firstName,
      lastName,
      email: emailLower,
      password: hashedPassword,
    });
    return newCoach
      .save()
      .then(() => res.status(200).json({ success: true }))
      .catch((e) => errorHandler(res, e.message));
  });
});

// login coach
router.post('/login', async (req, res) => {
  const emailAdress  = req.body.email.toLowerCase();
  const { password } = req.body;

  Coach.findOne({ email: emailAdress}).then((coach):
    | Response
    | Promise<boolean>
    | boolean
    | PromiseLike<boolean> => {
    // coach does not exist
    if (!coach) return errorHandler(res, 'Email or password is incorrect.');

    return compare(password, coach.password, (err, result) => {
      if (err) return errorHandler(res, err.message);

      if (result) {
        // password matched
        const accessToken = generateAccessToken(coach);
        const refreshToken = generateRefreshToken(coach);

        return Promise.all([accessToken, refreshToken]).then((tokens) =>
          res.status(200).json({
            success: true,
            accessToken: tokens[0],
            refreshToken: tokens[1],
          })
        );
      }

      // wrong password
      return errorHandler(res, 'Email or password is incorrect.');
    });
  });
});

// refresh token
router.post('/refreshToken', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return errorHandler(res, 'No token provided.');
  }

  return validateRefreshToken(refreshToken)
    .then((tokenResponse: ICoach) => generateAccessToken(tokenResponse))
    .then((accessToken: string) => {
      res.status(200).json({
        success: true,
        accessToken,
      });
    })
    .catch((err: { code: string; message: string }) => {
      if (err.code) {
        return errorHandler(res, err.message, err.code);
      }
      return errorHandler(res, err.message);
    });
});

// get me
// protected route
router.get('/me', auth, (req, res) => {

  const { userId } = req;
  return Coach.findById(new ObjectId(userId))
    .select('firstName lastName email _id')
    .then((coach) => {
      if (!coach) return errorHandler(res, 'User does not exist.');

      return res.status(200).json({ success: true, data: coach });
    })
    .catch((err) => errorHandler(res, err.message));
});

router.get('/getPatients', auth, (req, res) => {
  const patientID = req.params.id;
  return Patient.find().then((patients) => {
    
    return res.status(200).json(patients);
  });
});


router.get('/search', auth, async (req, res) => {
    const query = req.query.query;
    Coach.aggregate([
        {$project: { "name" : { $concat : [ "$firstName", " ", "$lastName" ] } }},
        { $match: {
            "name": {
                $regex: query,
                $options: "i"
            }
        }}
    ]).exec(function(err, result){
        return res.status(200).json({
            coaches: result
        });
    });
});


export default router;
