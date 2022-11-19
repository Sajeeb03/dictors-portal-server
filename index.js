const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

require('dotenv').config();

const port = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json())

function verifyJwt(req, res, next) {
    const authHeader = req.headers.authorization;
    // console.log(authHeader);
    if (!authHeader) {
        return res.status(401).send("Unauthorized access")
    }
    const token = authHeader.split(' ')[1];
    // console.log("token", token)
    // console.log(process.env.ACCESS_TOKEN)
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            // console.log(err.message)
            return res.status(403).send({ message: "Forbidden access" })
        }
        req.decoded = decoded;
        next();
    })
}

const uri = process.env.URI;
const client = new MongoClient(uri);

const dbConnect = async () => {
    try {
        await client.connect();
        console.log('db connected')
    } catch (error) {
        console.log(error.message, error.status)
    }
}

dbConnect();

const Services = client.db("doctors-portal").collection("appointmentOptions");
const Bookings = client.db("doctors-portal").collection("bookings");
const Users = client.db("doctors-portal").collection("users");


app.get('/appointments', async (req, res) => {
    try {
        const { date } = req.query;
        const options = await Services.find({}).toArray();

        const bookingQuery = { selectedDate: date }
        const booked = await Bookings.find(bookingQuery).toArray();

        options.forEach(option => {
            const bookedOptions = booked.filter(book => book.service === option.name);
            const bookedSlot = bookedOptions.map(book => book.slot);
            const remainingSlots = option.slots.filter(slot => !bookedSlot.includes(slot))
            option.slots = remainingSlots;
        })
        res.send(
            {
                success: true,
                data: options
            }
        )
    } catch (error) {
        res.send(
            {
                success: false,
                message: error.message
            }
        )
    }
})

//post bookings

app.post("/bookings", async (req, res) => {
    try {
        const booking = req.body;
        const query = {
            selectedDate: booking.selectedDate,
            service: booking.service,
            email: booking.email
        }
        const bookedOnce = await Bookings.find(query).toArray();
        if (bookedOnce.length) {
            return res.send({
                success: false,
                message: `You already have a booking at ${bookedOnce.slot}`
            })
        }
        const result = await Bookings.insertOne(booking);

        res.send({
            success: true,
            message: "Booking Confirmed"
        })
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

app.get('/bookings', verifyJwt, async (req, res) => {
    try {
        const { email } = req.query;
        const query = { email: email }
        // console.log(query)
        const result = await Bookings.find(query).toArray();
        // console.log(result)
        res.send({
            success: true,
            data: result
        })
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

//saving users
app.post("/users", async (req, res) => {
    try {
        const user = req.body;
        const result = await Users.insertOne(user);
        res.send(
            {
                success: true,
                message: "User saved"
            }
        )
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

//generate jwt
app.get('/jwt', async (req, res) => {
    try {
        const { email } = req.query;
        const user = await Users.findOne({ email: email });

        if (user) {
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: "1h" })
            return res.send({
                success: true,
                data: token
            })
        }
        else {
            res.status(401).send({
                success: false,
                message: "forbidden"
            })
        }
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

//users
app.get("/users", async (req, res) => {
    try {
        const result = await Users.find({}).toArray();
        res.send({
            success: true,
            data: result
        })
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

//admin 
app.put('/users/admin/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Users.updateOne({ _id: ObjectId(id) }, { $set: { role: "admin" } }, { upsert: true })
        res.send({
            success: true,
            message: "Admin added"
        })
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

app.get('/', (req, res) => {
    res.send("server is on");
})
app.listen(port, () => {
    console.log("server is running at", port)
})