const awsIot = require('aws-iot-device-sdk');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const credentials = require('./certs/credentials.json');

const raspberryPiCamera = require('raspberry-pi-camera-native');

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

    const options = {
        width: 3280,
        height: 2464,
        fps: 5,
        encoding: 'JPEG',
        quality: 100
    }
    raspberryPiCamera.start(options, () => {
        device.publish('LED', JSON.stringify({ message: 'The camera is ready' }));
    });
});
const output = `${__dirname}/test.jpg`;

function upload(img) {
    //configuring parameters
    var params = {
        Bucket: 'iot-image-raspicam',
        Body: img,//fs.createReadStream(output),
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
    device.publish('LED', JSON.stringify({ message: 'executing...' }));
    let image;
    try {
        image = await takePic();
        device.publish('LED', JSON.stringify({ message: 'taked...' }));
        // fs.writeFileSync(output, image);
        device.publish('LED', JSON.stringify({ message: 'saved...' }));
        // device.publish('LED', JSON.stringify({ message: 'picture ready' }));
    } catch (e) {
        console.log(e);
        device.publish('LED', JSON.stringify({ message: 'picture fail', e }));
        return;
    }

    device.publish('LED', JSON.stringify({ message: 'uploading...' }));
    const isUploaded = await upload(image);
    if (isUploaded) { console.log('The file is uploaded'); }
    else { console.log('The upload was fail'); }

}

function takePic() {
    return new Promise((res, rej) => {
        // add frame data event listener
        let pi = raspberryPiCamera.on('frame', (frameData) => {
            res(frameData);
            delete pi;
        });
    });
}

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


