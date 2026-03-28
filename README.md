# StudentShop

**Live Deployment:** [studentshop.com.au](https://studentshop.com.au)

StudentShop is an online marketplace for Australian high school study notes. You can either upload your own PDF notes for subjects like VCE, HSC, WACE, QCE, SACE or TCE to earn money, or browse and buy notes created by other students. We cover all major curriculum levels, so you can find notes for the same subjects you study in Year 11 and 12.

## Tech Stack

This project is separated into an Angular frontend and a Node.js/Express backend.

### Frontend
* **Framework:** Angular (v18.2.0)
* **Real-time Communication:** Socket.io-client
* **External Services:** Firebase, PayPal JS SDK, Mapbox Search
* **Utilities:** RxJS, QRCode, Mark.js, streamsaver

### Backend
* **Server Framework:** Node.js with Express (v4.21.1)
* **Databases & Search:** MongoDB (via Mongoose), Elasticsearch, Redis
* **Task Queues:** BullMQ
* **Real-time:** Socket.io with Redis Adapter
* **External Services:** AWS S3, PayPal Server SDK, Firebase Admin, OpenAI
* **PDF & Image Processing:** pdf-lib, pdf2pic, pdfjs-dist, sharp
* **Coordination:** node-zookeeper-client

## Prerequisites for Local Hosting

Ensure you have the following installed and running on your local machine:
* Elasticsearch v9.2.2
* MongoDB v8.2.0
* Monstache v6.8.0
* Ghostscript v10.05.1
* GraphicsMagick v1.4
* Redis v8.4.0
* ZooKeeper v3.9.3
* pdf2htmlEX v0.18.8.rc1
* qpdf v12.2.0
* PM2
* UFW