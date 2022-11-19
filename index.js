const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');

require('dotenv').config();

const port = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json())

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

app.get('/bookings', async (req, res) => {
    try {
        const { email } = req.query;
        const query = { email: email }

        const result = await Bookings.find(query).toArray();
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

app.get('/', (req, res) => {
    res.send("server is on");
})
app.listen(port, () => {
    console.log("server is running at", port)
})