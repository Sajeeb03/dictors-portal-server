const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const mg = require('nodemailer-mailgun-transport');
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


const sendBookingEmail = (booking) => {
    const { email, name, service, slot, selectedDate } = booking;
    // let transporter = nodemailer.createTransport({
    //     host: 'smtp.sendgrid.net',
    //     port: 587,
    //     auth: {
    //         user: "apikey",
    //         pass: process.env.SENDGRID_API_KEY
    //     }
    // })
    const auth = {
        auth: {
            api_key: process.env.MAIL_API,
            domain: process.env.MAIL_DOMAIN
        }
    }

    const transporter = nodemailer.createTransport(mg(auth));


    transporter.sendMail({
        from: "sajeebmuntasir0@gmail.com", // verified sender email
        to: email || "sajeebmuntasir0@gmail.com", // recipient email
        subject: "Appointment at Doctors Portal", // Subject line
        text: `Hello ${name}`, // plain text body
        html: `
        <h3>Your appointment is confirmed</h3>
        <div>
        <p>Your appointment for ${service} at ${slot} on ${selectedDate} is confirmed. Please be there on time.</p>
        <p><strong>With Regards</strong></p>
        <p>Doctors Portal Team</p>
        </div>
        `, // html body
    }, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

const Services = client.db("doctors-portal").collection("appointmentOptions");
const Bookings = client.db("doctors-portal").collection("bookings");
const Users = client.db("doctors-portal").collection("users");
const Doctors = client.db("doctors-portal").collection("doctors");
const Payments = client.db("doctors-portal").collection("payments");

//verify Admin 

const verifyAdmin = async (req, res, next) => {
    // console.log(req.decoded.email)
    const decodedEmail = req.decoded.email;
    const user = await Users.findOne({ email: decodedEmail });
    if (user.role !== 'admin') {
        return res.status(403).send({ success: false, message: "forbidden access" })
    }
    next();

}
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
//only appointment name

app.get('/specialty', async (req, res) => {
    try {
        const result = await Services.find({}).project({ name: 1 }).toArray();
        res.send({
            success: true,
            data: result
        })

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
        // console.log(bookedOnce)
        if (bookedOnce.length) {
            return res.send({
                success: false,
                message: `You already have a booking at ${bookedOnce[0].slot}`
            })
        }
        const result = await Bookings.insertOne(booking);
        sendBookingEmail(booking)
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

//info 

app.get('/bookings/:id', verifyJwt, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Bookings.findOne({ _id: ObjectId(id) })
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

//deleting user
app.delete('/users/:id', verifyJwt, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Users.deleteOne({ _id: ObjectId(id) })
        res.send({
            success: true,
            message: "user deleted"
        })
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

//payment gateway
app.post("/create-payment-intent", verifyJwt, async (req, res) => {
    try {
        const booking = req.body;
        const price = booking.price;
        const amount = price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
            currency: "usd",
            amount: amount,
            "payment_method_types": [
                "card"
            ]
        });
        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        res.send(error.message)
    }
})

app.post('/payments', verifyJwt, async (req, res) => {
    try {
        const payment = req.body;
        const result = await Payments.insertOne(payment);
        const id = payment.booking;
        const filter = { _id: ObjectId(id) }
        const updatedDoc = {
            $set: {
                paid: true,
                transactionId: payment.transactionId
            }
        }

        const updateBooking = await Bookings.updateOne(filter, updatedDoc)
        res.send({
            success: true,
            message: 'Payment successful',
            data: result
        })
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
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: "1d" })
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
app.get("/users", verifyJwt, async (req, res) => {
    try {
        const decodedEmail = req.decoded.email;
        const user = await Users.findOne({ email: decodedEmail });
        if (user.role !== "admin") {
            return res.send(
                {
                    success: false,
                    data: []
                }
            )
        }

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
//check if admin for hook

app.get('/users/admin/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const result = await Users.findOne({ email: email })
        res.send({ isAdmin: result.role === 'admin' });
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})

//admin 
app.put('/users/admin/:id', verifyJwt, verifyAdmin, async (req, res) => {
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
// //temporary updates
// app.put('/price', async (req, res) => {
//     const result = await Services.updateMany({}, { $set: { price: 99 } }, { upsert: true })
//     res.send(result)
// })

//post doctors

app.post('/doctors', verifyJwt, verifyAdmin, async (req, res) => {
    try {
        const result = await Doctors.insertOne(req.body);
        res.send({
            success: true,
            message: "Doctor Added"
        })
    } catch (error) {
        res.send({
            success: false,
            message: error.message
        })
    }
})
//get doctors
app.get("/doctors", verifyJwt, verifyAdmin, async (req, res) => {
    try {
        const result = await Doctors.find({}).toArray();
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

//delete doctor
app.delete('/doctors/:id', verifyJwt, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Doctors.deleteOne({ _id: ObjectId(id) });
        res.send({
            success: true,
            message: "Deletion successful",
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