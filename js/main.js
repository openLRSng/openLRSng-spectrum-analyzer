var connectionId = -1;
var port_list;
var serial_poll = 0; // iterval timer refference

var element_plot;
var plot;
var plot_poll = 0;

var plot_data = new Array(4);
var plot_data_avr_sum = new Array();

var analyzer_config = {
    start_frequency: 425,
    stop_frequency:  435,
    average_samples: 500,
    step_size:       5
};

var plot_config = {
    type: 'lines',
    units: 1,
    overtime_averaging: 0
};

$(document).ready(function() {
    port_picker = $('div#port-picker .port select');
    baud_picker = $('div#port-picker #baud');
    
    $('div#port-picker a.refresh').click(function() {
        console.log("Available port list requested.");
        port_picker.html('');

        chrome.serial.getPorts(function(ports) {
            if (ports.length > 0) {
                // Port list received
                
                ports.forEach(function(port) {
                    $(port_picker).append($("<option/>", {
                        value: port,
                        text: port
                    }));        
                });
            } else {
                $(port_picker).append('<option>NOT FOUND</option>');
                
                console.log("No serial ports detected");
            }
        });
    });
    
    // software click to refresh port picker select (during initial load)
    $('div#port-picker a.refresh').click(); 

    $('div#port-picker a.connect').click(function() {
        var clicks = $(this).data('clicks');
        
        if (clicks) { // odd number of clicks
            chrome.serial.close(connectionId, onClosed);
            
            clearInterval(serial_poll);
            serial_poll = 0; // this also indicates that we are not reading anything
            
            $(this).text('Connect');
            $(this).removeClass('active');            
        } else { // even number of clicks         
            selected_port = String($(port_picker).val());
            selected_baud = parseInt(baud_picker.val());
            
            console.log('Connecting to: ' + selected_port);
            
            chrome.serial.open(selected_port, {
                bitrate: selected_baud
            }, onOpen);
            
            $(this).text('Disconnect');  
            $(this).addClass('active');
        }
        
        $(this).data("clicks", !clicks);
    });     
    
    // Analyzer configuration UI hooks
    $('div#analyzer-configuration select').change(function() {
        // update analyzer config with latest settings
        analyzer_config.start_frequency = parseInt($('#start-frequency').val());
        analyzer_config.stop_frequency = parseInt($('#stop-frequency').val());
        analyzer_config.average_samples = parseInt($('#average-samples').val());
        analyzer_config.step_size = parseInt($('#step-size').val());
        
        send_current_configuration();     
    });
    
    $('div#plot-configuration select').change(function() {
        plot_config.type = String($('#plot-type').val());
        plot_config.units = parseFloat($('#plot-units').val());
        
        plot_options.defaultType = plot_config.type;
        
        if (plot_config.units == 1.00) {
            plot_options.yaxis.max = 240;
            plot_options.yaxis.min = 0;
            plot_options.yaxis.noTicks = 12;
        } else if (plot_config.units == 0.5) {
            plot_options.yaxis.max = 120;
            plot_options.yaxis.min = 0;
            plot_options.yaxis.noTicks = 10;
        }
        
        // sending configuration in this case is meant only to re-initialize arrays due to unit change
        send_current_configuration(); 
    });
    
    $('div#plot-configuration input').change(function() {
        if ($(this).is(':checked')) {
            plot_config.overtime_averaging = 1;
        } else {
            plot_config.overtime_averaging = 0;
        }
        
        // sending configuration in this case is meant only to re-initialize arrays due to unit change
        send_current_configuration(); 
    });
    
    // Populate configuration selects    
    var e_start_frequency = $('#start-frequency').html('');
    for (var i = 400; i < 470; i++) {
        e_start_frequency.append($("<option/>", {
            value: i,
            text: i
        }));        
    }
    
    var e_stop_frequency = $('#stop-frequency').html('');
    for (var i = 401; i < 471; i++) {
        e_stop_frequency.append($("<option/>", {
            value: i,
            text: i
        }));        
    }

    var e_average_samples = $('#average-samples').html('');
    for (var i = 100; i < 1501; i += 100) {
        
        e_average_samples.append($("<option/>", {
            value: i,
            text: i
        }));        
    }
    
    var e_step_size = $('#step-size').html('');
    for (var i = 1; i < 100; i += 1) {
        e_step_size.append($("<option/>", {
            value: i,
            text: i
        }));        
    }
    
    // Define some defualt values
    e_start_frequency.val(analyzer_config.start_frequency);
    e_stop_frequency.val(analyzer_config.stop_frequency);
    e_average_samples.val(analyzer_config.average_samples);
    e_step_size.val(analyzer_config.step_size);
    
    // manually fire change event so variables get populated
    $('div#analyzer-configuration select').change(); 
    
    e_averaging_counter = $('span.overtime-averaging-counter');
    
    // Pause Resume handler
    $('.pause-resume').click(function() {
        var clicks = $(this).data('clicks');
        
        if (clicks) { // odd number of clicks
            // empty buffer manually
            chrome.serial.read(connectionId, 1048575, function() {});
            
            serial_poll = setInterval(readPoll, 10);
            plot_poll = setInterval(redraw_plot, 40);
            
            plot_options.mouse.track = false;
            
            $(this).text('Pause');
            $(this).removeClass('resume');            
        } else { // even number of clicks
            clearInterval(serial_poll);
            clearInterval(plot_poll);
            
            plot_options.mouse.track = true;
            redraw_plot();
            
            $(this).text('Resume');  
            $(this).addClass('resume');
        }
        
        $(this).data("clicks", !clicks);        
    });
    
    // Plot
    element_plot = document.getElementById("plot");
    
    plot_options = {
        defaultType: plot_config.type,
        colors: ['#d60606', '#00a8f0', '#c0d800'],
        shadowSize: 0,
        yaxis: {
            max: 240,
            min: 0,
            noTicks: 12,
            autoscale: true
        },
        xaxis: {
            noTicks: 10,
            max: analyzer_config.stop_frequency * 100,
            min: analyzer_config.start_frequency * 100,
            tickFormatter: function(x) {
                var x = parseInt(x);
                x /= 100;
                return x + ' MHz';
            }
        },
        grid: {
            backgroundColor: "#FFFFFF"
        },
        legend: {
            position: "wn",
            backgroundOpacity: 0
        },
        mouse: {
            track: false,
            relative: true,
            margin: 10,
            fillOpacity: 1,
            trackFormatter: function(x) {
                var frequency = x.x / 100;
                var val = x.y;
                
                return frequency + ' Mhz @ ' + val;
            }
        }
    } 
});

function readPoll() {
    chrome.serial.read(connectionId, 256, onCharRead);
}

function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    
    if (connectionId != -1) {
        // start polling
        serial_poll = setInterval(readPoll, 10);
        
        // Send over the configuration
        send_current_configuration();
        
        console.log('Connection established.');
    } else {
        console.log('There was a problem while opening the connection.');
    }
}

function onClosed(result) {
    if (result == 1) {
        connectionId = -1; // reset connection id
        console.log('Connection closed successfully.');
    } else {
        console.log('There was an error that happened during "connection-close" procedure.');
    }
}

function send_current_configuration() {    
    if (connectionId > 0) { // only send configuration over while connected
        var ascii_out = "#" + 
            analyzer_config.start_frequency.toString() + "," + 
            analyzer_config.stop_frequency.toString() + "," + 
            analyzer_config.average_samples.toString() + "," + 
            analyzer_config.step_size.toString() + ",";
        
        var bufferOut = new ArrayBuffer(ascii_out.length);
        var bufView = new Uint8Array(bufferOut);
        
        for (var i = 0; i < ascii_out.length; i++) {
            bufView[i] = ascii_out.charCodeAt(i);
        }

        // Send over the configuration
        chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
            console.log("Wrote: " + writeInfo.bytesWritten + " bytes");
            
            // drop current data and re-populate the array
            var array_size = ((analyzer_config.stop_frequency * 100) - (analyzer_config.start_frequency * 100)) / analyzer_config.step_size;
            
            plot_data[0] = [];
            plot_data[1] = [];
            plot_data[2] = [];
            plot_data[3] = [];
            plot_data_avr_sum = [];
            
            for (var i = 0; i <= array_size; i++) {
                plot_data[0][i] = [100000, 0];
                plot_data[1][i] = [100000, 0];
                plot_data[2][i] = [100000, 0];
                plot_data[3][i] = [100000, 0];
                plot_data_avr_sum[i] = [0, 0]; // sum, samples_n
            }
            
            // Update plot
            plot_options.xaxis.max = analyzer_config.stop_frequency * 100;
            plot_options.xaxis.min = analyzer_config.start_frequency * 100;  
        });
    }
}

var message_buffer = new Array();
function onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            if (data[i] == 0x0A) { // new line character \n
                // process message and start receiving a new one
                process_message(message_buffer);
                
                // empty buffer
                message_buffer = Array();
            } else {            
                message_buffer.push(data[i]);
            }    
        }
    }
}

var last_index = 0;
function process_message(message_buffer) {
    var message_needle = 0;
    
    var message = {
        frequency: 0,
        RSSI_MAX:  0,
        RSSI_SUM:  0,
        RSSI_MIN:  0
    };

    for (var i = 0; i < message_buffer.length; i++) {
        if (message_buffer[i] == 0x2C) { // divider ,
            message_needle++;
        } else {
            message_buffer[i] -= 0x30;
            
            switch (message_needle) {
                case 0:
                    message.frequency = message.frequency * 10 + message_buffer[i];
                    break;
                case 1:
                    message.RSSI_MAX = message.RSSI_MAX * 10 + message_buffer[i];
                    break;
                case 2:
                    message.RSSI_SUM = message.RSSI_SUM * 10 + message_buffer[i];
                    break;
                case 3:
                    message.RSSI_MIN = message.RSSI_MIN * 10 + message_buffer[i];
                    break;
            }
        }
    }
    
    var index = (message.frequency - (analyzer_config.start_frequency * 100)) / analyzer_config.step_size;
    
    if (index <= plot_data[0].length) {     
        // doing pre-comupation to save (optimize) cycles
        var c_RSSI_MAX = message.RSSI_MAX * plot_config.units;
        var c_RSSI_SUM = message.RSSI_SUM * plot_config.units;
        var c_RSSI_MIN = message.RSSI_MIN * plot_config.units;
        
        if (plot_config.overtime_averaging == 1) {            
            if (c_RSSI_MAX > plot_data[0][index][1]) plot_data[0][index] = [message.frequency, c_RSSI_MAX];
            if (c_RSSI_SUM > plot_data[1][index][1]) plot_data[1][index] = [message.frequency, c_RSSI_SUM];
            if (c_RSSI_MIN < plot_data[2][index][1] || plot_data[2][index][1] == 0) plot_data[2][index] = [message.frequency, c_RSSI_MIN];
            
            plot_data_avr_sum[index][1] += 1;
            plot_data_avr_sum[index] = [plot_data_avr_sum[index][0] + c_RSSI_SUM, plot_data_avr_sum[index][1]];
            plot_data[3][index] = [message.frequency, plot_data_avr_sum[index][0] / plot_data_avr_sum[index][1]];
        } else {
            plot_data[0][index] = [message.frequency, c_RSSI_MAX];
            plot_data[1][index] = [message.frequency, c_RSSI_SUM];
            plot_data[2][index] = [message.frequency, c_RSSI_MIN];
        }
    }
    
    if (last_index > index) { // new sample detection
        var peak = [0, 0];
        for (var i = 0; i < plot_data[0].length; i++) {
            if (plot_data[0][i][1] > peak[1]) {
                peak = [plot_data[0][i][0], plot_data[0][i][1]];
            }
        }
        
        $('div#peak-detection').html('<li>Peak: ' + parseFloat(peak[0] / 100) + ' MHz @ ' + peak[1] + '</li>');
    }
    
    last_index = index;
}

plot_poll = setInterval(redraw_plot, 40); // 1s = 1000ms, 1000/40 = 25 frames per second
function redraw_plot() {
    plot = Flotr.draw(element_plot, [ 
        {data: plot_data[0], label: "MAX", lines: {fill: false}}, 
        {data: plot_config.overtime_averaging ? plot_data[3] : plot_data[1], label: "AVERAGE", lines: {fill: false}}, 
        {data: plot_data[2], label: "MIN", lines: {fill: true}} ], plot_options);  

    // Update averaging counter
    if (plot_config.overtime_averaging) {
        e_averaging_counter.html(plot_data_avr_sum[0][1]);
    } else {
        e_averaging_counter.html(0);
    }
}