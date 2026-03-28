require("dotenv").config(); // Load environment variables.
const express = require("express");
const http = require("http");
const cors = require("cors");
const { S3Client } = require("@aws-sdk/client-s3");
const { Server } = require("socket.io");
const {initialiseClient: initialiseFirebaseAdminClient, verifyIdToken} = require("./services/AuthenticationService");
const TaskScheduler = require("./services/TaskScheduler");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const mongoose = require("mongoose");
const Cart = require("./models/Cart");
const Note = require("./models/Note");
const Purchase = require("./models/Purchase");
const Refund = require("./models/Refund");
const Review = require("./models/Review");
const School = require("./models/School");
const Subject = require("./models/Subject");
const Transaction = require("./models/Transaction");
const User = require("./models/User");
const Withdrawal = require("./models/Withdrawal");
const {Environment} = require("./models/common");

// Create Node.js server.
const app = express();
const server = http.createServer(app);
app.set("port_number", 8081);
if (process.env.ENVIRONMENT !== Environment.PRODUCTION) {
  // Use cors for development.
  app.use(cors({
    origin: "http://localhost:8082",
    credentials: true,
  }));
}
app.use(express.urlencoded({extended: true}));
app.use(express.json());

function connectToFirebaseAdmin() {
  const response = initialiseFirebaseAdminClient();
  console.log(response);
}

function setModelReferences() {
  Cart.setModelReferences({ Note });
  Note.setModelReferences({ User, Subject, Refund, Review });
  Purchase.setModelReferences({ User, Note, Refund, Transaction });
  Refund.setModelReferences({ Purchase });
  Review.setModelReferences({ Note, User });
  Transaction.setModelReferences({ User, Note, Purchase, Withdrawal });
  User.setModelReferences({ School, Subject });
  Subject.setModelReferences({ User, Note });
  Withdrawal.setModelReferences({ Transaction });
  console.log("Model references set successfully.");
}

async function connectToMongoDB() {
  // Create and connect to MongoDB client.
  const MONGO_URL = "mongodb://127.0.0.1:27017";
  await mongoose.connect(MONGO_URL,
    {
      dbName: "studentShop",
      user: process.env.MONGO_USER,
      pass: process.env.MONGO_PASSWORD,
    });

  await Cart.initialiseMongooseSchema();
  await Note.initialiseMongooseSchema();
  await Purchase.initialiseMongooseSchema();
  await Refund.initialiseMongooseSchema();
  await Review.initialiseMongooseSchema();
  await School.initialiseMongooseSchema();
  await Subject.initialiseMongooseSchema();
  await Transaction.initialiseMongooseSchema();
  await User.initialiseMongooseSchema();
  await Withdrawal.initialiseMongooseSchema();
  console.log("MongoDB connected successfully.");
}

async function connectToElasticSearch() {
  await School.initialiseElasticIndex();
  await Subject.initialiseElasticIndex();
  await Note.initialiseElasticIndex();
  await Purchase.initialiseElasticIndex();
  await Refund.initialiseElasticIndex();
  await Transaction.initialiseElasticIndex();
  await Review.initialiseElasticIndex();
  await User.initialiseElasticIndex();
  await Withdrawal.initialiseElasticIndex();
  console.log("ElasticSearch indexes connected successfully.");
}

function connectToCloudflareR2() {
  // Create Cloudflare R2 storage client.
  // Export r2 client.
  module.exports.r2 = new S3Client({
    region: "auto",
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED"
  });
}

function connectToZooKeeper() {
  const QueueLockService = require("./services/QueueLockService");
  const response = QueueLockService.initialiseClient();
  console.log(response);
}

async function connectToSocketIo() {
  // Socket.io
  const socketIo = new Server(server, {
    ...(process.env.ENVIRONMENT !== Environment.PRODUCTION ? {
      // Use cors for development.
      cors: {
        origin: "http://localhost:8082",
        methods: ["GET", "POST"],
        credentials: true
      },
    } : {}),
    path: "/api/socket.io/",
    transports: ["websocket"]
  });

  async function setupRedisAdapter() {
    const pubClient = createClient({ url: "redis://localhost:6379" });
    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    socketIo.adapter(createAdapter(pubClient, subClient));
    // Store client references.
    socketIo._pubClient = pubClient;
    socketIo._subClient = subClient;
  }
  async function initialiseSocketIo() {
    await setupRedisAdapter();
    socketIo.use(async (socket, next) => {
      try {
        const idToken = socket.handshake.auth?.token || socket.handshake.query?.token;
        socket.user = await verifyIdToken(idToken);

        next();
      } catch (error) {
        return next(new Error(error?.cause?.code || "UNKNOWN")); // Send error message.
      }
    });

    socketIo.on("connection", (socket) => {
      const uid = socket?.user?.uid;
      // Put each user's sockets into a per-user room.
      const room = `user_${uid}`;
      socket.join(room);

      socket.on("disconnect", () => {
        // Optional cleanup.
      });
    });

    return "Socket.io initialised successfully.";
  }

  const response = await initialiseSocketIo();
  console.log(response);
  module.exports.socketIo = socketIo;
}

function startScheduledTasks() {
  TaskScheduler.startProcessUnfulfilledSaleTransactionsJob();
  console.log("Scheduled tasks started successfully.");
}

function setUpRoutes() {
  // Root routes (includes sitemaps).
  const rootRouter = require("./routes/root-routes");
  app.use("/", rootRouter);

  const schoolRouter = require("./routes/school-routes");
  const subjectRouter = require("./routes/subject-routes");
  const userRouter = require("./routes/user-routes");
  const cartRouter = require("./routes/cart-routes");
  const noteRouter = require("./routes/note-routes");
  const transactionRouter = require("./routes/transaction-routes");
  const purchaseRouter = require("./routes/purchase-routes");
  const reviewRouter = require("./routes/review-routes");
  const withdrawalRouter = require("./routes/withdrawal-routes");
  app.use("/api/v1/schools", schoolRouter);
  app.use("/api/v1/subjects", subjectRouter);
  app.use("/api/v1/users", userRouter);
  app.use("/api/v1/carts", cartRouter);
  app.use("/api/v1/notes", noteRouter);
  app.use("/api/v1/purchases", purchaseRouter);
  app.use("/api/v1/transactions", transactionRouter);
  app.use("/api/v1/reviews", reviewRouter);
  app.use("/api/v1/withdrawals", withdrawalRouter);

  // Admin routes.
  const adminNoteRouter = require("./routes/admin-routes/note-routes");
  const adminReviewRouter = require("./routes/admin-routes/review-routes");
  const adminUserRouter = require("./routes/admin-routes/user-routes");
  const adminPurchaseRouter = require("./routes/admin-routes/purchase-routes");
  const adminTransactionRouter = require("./routes/admin-routes/transaction-routes");
  const adminRefundRouter = require("./routes/admin-routes/refund-routes");
  const adminSchoolRouter = require("./routes/admin-routes/school-routes");
  const adminSubjectRouter = require("./routes/admin-routes/subject-routes");
  const adminWithdrawalRouter = require("./routes/admin-routes/withdrawal-routes");
  app.use("/api/v1/admin/notes", adminNoteRouter);
  app.use("/api/v1/admin/reviews", adminReviewRouter);
  app.use("/api/v1/admin/users", adminUserRouter);
  app.use("/api/v1/admin/purchases", adminPurchaseRouter);
  app.use("/api/v1/admin/transactions", adminTransactionRouter);
  app.use("/api/v1/admin/refunds", adminRefundRouter);
  app.use("/api/v1/admin/schools", adminSchoolRouter);
  app.use("/api/v1/admin/subjects", adminSubjectRouter);
  app.use("/api/v1/admin/withdrawals", adminWithdrawalRouter);
}

async function runServer() {
  connectToFirebaseAdmin();
  setModelReferences();
  await connectToMongoDB();
  await connectToElasticSearch();
  connectToCloudflareR2();
  connectToZooKeeper();
  await connectToSocketIo();
  startScheduledTasks();
  setUpRoutes();

  // Run server.
  server.listen(app.get("port_number"),(error) => {
    if (error){
      console.error(error);
    }
    console.log(`Server started on http://localhost:${app.get("port_number")}/`);
  });
}

// Run server.
runServer().then();