const awsIot = require('aws-iot-device-sdk');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const credentials = require('./certs/credentials.json');
const PiCamera = require('pi-camera');
const { StillCamera, StreamCamera, Codec } = require('pi-camera-connect');
const stillCamera = new StillCamera();

const streamCamera = new StreamCamera({
    codec: Codec.MJPEG
});


//configuring the AWS environment
AWS.config.update(credentials);
var s3 = new AWS.S3();

var device = awsIot.device({
    keyPath: './certs/private.pem.key',
    certPath: './certs/certificate.pem.crt',
    caPath: './certs/AmazonRootCA1.pem',
    clientId: 'cosa5',
    region: 'us-east-1',
    host: 'a349hitxtjootl-ats.iot.us-east-1.amazonaws.com',
    //debug: true
});
device.subscribe('LED');
device.on('connect', function () {
    device.publish('LED', JSON.stringify({ message: 'Raspberry are connected' }));
    streamCamera.startCapture().then(x => {
        device.publish('LED', JSON.stringify({ message: 'The camera is ready' }));
    })
});
const output = `${__dirname}/test.jpg`;
const myCamera = new PiCamera({
    mode: 'photo',
    output,
    width: 640,
    height: 480,
    nopreview: true,
});

function connecting(dev) {
    return new Promise((res, rej) => {
        dev.on('connect', function () {
            res(true);
            // console.log('connected');
            // device.subscribe('LED');
            device.publish('LED', JSON.stringify({ message: 'Raspberry are connected' }))
        });
    });
}
function upload() {
    //configuring parameters
    var params = {
        Bucket: 'iot-image-raspicam',
        Body: fs.createReadStream(output),
        Key: "folder/" + Date.now() + "_" + path.basename(output)
    };
    return new Promise((res, rej) => {
        s3
            .upload(params)
            .on('httpUploadProgress', event => {
                //console.log(`Uploaded ${event.loaded} out of ${event.total}: ${parseInt(event.loaded/event.total*100)}%`);
                device.publish('LED', JSON.stringify({ message: 'uplading', upload: parseInt(event.loaded / event.total * 100) }));
            })
            .send((err, data) => {
                if (err) { res(false); } else { res(true); }
                device.publish('LED', JSON.stringify({ message: err ? 'error' : 'sended', data: err ? err : data }));
            });
    });
}

async function exec() {
    console.log('executing...');
    // const isConnected = await connecting(device);
    // if (!isConnected) { return; }

    try {
        // await myCamera.snap();
        const image = await streamCamera.takeImage();//await stillCamera.takeImage();
        fs.writeFileSync(output, image);
        device.publish('LED', JSON.stringify({ message: 'picture ready' }));
    } catch (e) { device.publish('LED', JSON.stringify({ message: 'picture fail', e })); return; }

    const isUploaded = await upload();
    if (isUploaded) { console.log('The file is uploaded'); }
    else { console.log('The upload was fail'); }

}

// exec();
device.on('message', function (topic, payload) {

    try {
        console.log('on message', topic, payload.toString());
        const p = JSON.parse(payload.toString());
        if (p.code === 100) {
            exec();
        }
    } catch (error) {
        console.log(error);
    }
})


