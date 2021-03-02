// Twitch弹幕助手
// 在 BABANANA-Chat-Web[https://github.com/Eotones/BABANANA-Chat-Web] 的基础上进行修改
// by Liquor030

//全域变量
const DEBUG_MODE = false;
// 是否显示console.log, 值: true or false
// 例:
// DEBUG_MODE && console.log("errer");

//检查浏览器来源
// 返回 string
// 值: "obs_browser", "desktop_app", "normal_browser"
// 参考资料: https://github.com/obsproject/obs-browser/blob/master/README.md
const check_browser_source = function(){
  if(typeof window.obsstudio !== 'undefined'){ // obs studio专用js
    // is OBS browser
    document.body.id = "css_for_obs";
    return "obs_browser";
  }else{
    // other browser
    return "normal_browser";
  }
};
var browser_source = check_browser_source();



const page_load_time = new Date().getTime();
let chat_ws_conn_time = new Date().getTime();

const client_id = 'chikattochikachika';

// const wsUri_chat = "wss://cht.ws.kingkong.com.tw/chat_nsp/?EIO=3&transport=websocket"; //chat server
// const wsUri_gift_2 = "wss://ctl.ws.kingkong.com.tw/control_nsp/?EIO=3&transport=websocket"; //gift server
// const wsUri_gift_1 = "wss://ctl-1.ws.kingkong.com.tw/control_nsp/?EIO=3&transport=websocket"; //馆长台

//const wsUri_chat = "wss://cht.lv-show.com/socket.io/?EIO=3&transport=websocket"; //chat server
//const wsUri_gift = "wss://ctl.lv-show.com/socket.io/?EIO=3&transport=websocket"; //gift server

const wsUri_chat = "wss://irc-ws.chat.twitch.tv/";
const hexch = new Array('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F');

var output; //聊天室输出 div#output
var output_last_lines = new Array(); //保存最新的n行讯息
var heat; //热度 div#heat
var user_cnt; //观众数 div#user_cnt
var viewers = 0;
var setting_div; //设置栏 #setting_div
var scroll_to_bottom_btn; //卷到到最新行的按钮 #scroll_to_bottom_btn
var ping; // 保持websocket连线,PING-PONG
var chat_i = 0; //计算聊天室的行数
var tokens = []; //连线资讯
var stop_scroll = false; //上拉时防止卷动
var tool_bar_datetime_span; //toolbar时间
var last_msg_time = 0;


//检查使用者自订的css display属性
// none为false,否则为true
var cssCheck_kk_gift;
var cssCheck_kk_reconn;
var cssCheck_kk_bana;
var cssCheck_kk_come;

var reconnection_chat_count = 0; //计算断线重连次数 chat server

//外部变量(index.htm<script>)
//无设置时使用默认值
var obs_mode;
var chat_limit;
var csrf_token;

if (typeof document.body.dataset.obs_mode === "undefined") {
  obs_mode = false;
}else{
  obs_mode = (document.body.dataset.obs_mode == "true" || document.body.id === "css_for_obs");
}

if (typeof document.body.dataset.chat_limit === "undefined") {
  chat_limit = 10;
}else{
  chat_limit = parseInt(document.body.dataset.chat_limit);
}

if (typeof document.body.dataset.csrf_token === "undefined") {
  csrf_token = false;
}else{
  csrf_token = document.body.dataset.csrf_token;
}


/*
CSS:
.toggle-content { display: none; }
.toggle-content.is-visible { display: block; }

JS:
elemVisibility.init(elem);
elemVisibility.show(elem);
elemVisibility.hide(elem);
elemVisibility.toggle(elem);
elemVisibility.check(elem);
*/
const elemVisibility = {
  init: function (elem, default_show = true) {
      elem.classList.add('toggle-content'); // display: none;
      if (default_show) {
          this.show(elem); // display: block;
      }
  },
  init_inline(elem, default_show = true) {
      elem.classList.add('toggle-content'); // display: none;
      if (default_show) {
          this.show_inline(elem); // display: inline-block;
      }
  },
  show: function (elem) {
      elem.classList.add('is-visible'); // display: block;
  },
  show_inline: function (elem) {
      elem.classList.add('is-visible-inline'); // display: inline-block;
  },
  hide: function (elem) {
      elem.classList.remove('is-visible');
  },
  toggle: function (elem) {
      elem.classList.toggle('is-visible');
  },
  toggle_inline: function (elem) {
      elem.classList.toggle('is-visible-inline');
  },
  check: function (elem) {
      if (getComputedStyle(elem).display === 'none') {
          return false;
      } else {
          return true;
      }
  }
};

const main = {
  init: function () {
    // 当 hashtag 改变时重新载入页面
    window.addEventListener("hashchange", function () {
      location.reload();
    }, false);

    //判断载入分页
    if (window.location.hash == '' || window.location.hash == '#') {
      //载入首页
      this.goto_home_page();
    } else {
      //载入聊天室页面
      this.goto_chat_page();
    }
  },
  goto_home_page: function () { //载入首页
    let c_script = document.getElementById("c_script");
    elemVisibility.show(c_script);
    this.change_channel_btn(); //改完后触发hashchange重载页面
  },
  goto_chat_page: function () { //载入聊天室页面
    this.check_scroll(); //检查画面卷动方向,如果向上则触法暂停卷动功能

    output = document.getElementById("output"); //聊天室输出
    output.innerHTML = '';

    heat = document.getElementById("heat"); //热度
    heat.innerHTML = '<font color="#FFFF00">●</font> 加载中..';

    // 人数显示
    this.getUseViewCount();
    setInterval(() => {
      this.getUseViewCount();
    }, 10000);

    if (obs_mode == false) {
      //关闭checkbox
      document.querySelector("#ttsCheck").checked = false; //语音
      document.querySelector("#statsUiCheck").checked = false; //统计
      
      this.scroll_to_bottom_btn(); //建立向下卷动按钮
      
      //开启设置选单
      setting_div = document.getElementById("setting_div");
      scroll_to_bottom_btn = document.getElementById("scroll_to_bottom_btn");

      document.getElementById("tool_bar").addEventListener("mouseup", function(){
        elemVisibility.toggle(setting_div);
      });
    }

    let get_hashtag = window.location.hash;
    //let get_token_url;

    if (get_hashtag !== '' || get_hashtag !== '#') {

      elemVisibility.hide( document.getElementById("announcements") );
      elemVisibility.show( document.getElementById("tool_bar") );

      cssCheck_tool_bar = !( getComputedStyle( document.getElementById('tool_bar') ).display === 'none' );
      if (obs_mode == false && cssCheck_tool_bar == true) {
        //setting_div.style.display = 'block'; //新功能先默认开启
        //elemVisibility.show(setting_div);
      }
      this.cssCheck();

      webSocket_chat();
    }
  },
  getUseViewCount: function () { //加载观看人数
    fetch(
      'https://gql.twitch.tv/gql',
      {
        method: 'POST', // GET
        headers: {
          'content-type': 'application/json',
          'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
        },
        cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
        mode: 'cors', // no-cors, cors, *same-origin
        body: JSON.stringify({
          "operationName": "UseViewCount",
          "variables": {
            "channelLogin": `${window.location.hash.substr(1)}`
          },
          "extensions": {
            "persistedQuery": {
              "version": 1,
              "sha256Hash": "00b11c9c428f79ae228f30080a06ffd8226a1f068d6f52fbc057cbde66e994c2"
            }
          }
        })
      }
    ).then((response) => {
      return response.json();
    }).then((rsp_json) => {
      user = rsp_json["data"]["user"]
      if (user == null)
      {
        heat.innerHTML = '<font color="#FF0000">●</font> 未找到该直播间';
      }
      else{
        stream = user["stream"]
        if (stream == null)
        {
          heat.innerHTML = '<font color="#FF0000">●</font>  未开播';
        }
        else
        {
          heat.innerHTML = `<font color="#00FF00">●</font> 人数: ${stream["viewersCount"]}`;
        }
      }
    })
  },
  change_channel_btn: function () { //首页切换频道按钮
    let btn_submit = document.getElementById("btn_submit");
    let input_submit = document.getElementById("inputChannel");

    btn_submit.addEventListener("mouseup", function () {
      DEBUG_MODE && console.log("onmouseup");
      DEBUG_MODE && console.log(input_submit.value);
      window.location.hash = `#${input_submit.value}`;
    });

    input_submit.addEventListener("keydown", function (e) {
      if (e.keyCode == 13 || e.which == 13) {
        DEBUG_MODE && console.log("onkeydown");
        DEBUG_MODE && console.log(input_submit.value);
        window.location.hash = `#${input_submit.value}`;
      }
    });
  },
  cssCheck: function() { //检查用户自订的display是否为none,若为none则直接不输出到网页上(输出前判定)
    main.writeToScreen(`<span class="pod">TEST</span> .kk_chat`,   ["kk_chat","testCSS"]);

    main.writeToScreen(`<span class="pod">TEST</span> .kk_gift`,   ["kk_gift",   "testCSS"]);
    main.writeToScreen(`<span class="pod">TEST</span> .kk_reconn`, ["kk_reconn", "testCSS"]);
    main.writeToScreen(`<span class="pod">TEST</span> .kk_bana`,   ["kk_bana",   "testCSS"]);
    main.writeToScreen(`<span class="pod">TEST</span> .kk_come`,   ["kk_come",   "testCSS"]);

    //计算OBS版的最大行数
    if(obs_mode===true){
      this.linesCheck();

      //若窗口大小被改变
      //(正常在OBS下使用不会触发这个,主要是浏览器上测试用)
      window.addEventListener('resize', () => {
        this.linesCheck();
      }, true);
    }
    
    //全域变量
    cssCheck_kk_gift =   !( getComputedStyle( document.querySelector('.kk_gift')   ).display === 'none' );
    cssCheck_kk_reconn = !( getComputedStyle( document.querySelector('.kk_reconn') ).display === 'none' );
    cssCheck_kk_bana =   !( getComputedStyle( document.querySelector('.kk_bana')   ).display === 'none' );
    cssCheck_kk_come =   !( getComputedStyle( document.querySelector('.kk_come')   ).display === 'none' );

    //测试完后删除
    document.querySelectorAll(".testCSS").forEach((e) => {
      e.parentNode.removeChild(e);
    });
    
    console.log('[cssCheck] kk_gift: ' + cssCheck_kk_gift);
    console.log('[cssCheck] kk_reconn: ' + cssCheck_kk_reconn);
    console.log('[cssCheck] kk_bana: ' + cssCheck_kk_bana);
    console.log('[cssCheck] kk_come: ' + cssCheck_kk_come);

    //elemVisibility.hide( document.getElementById('cssCheck') );
  },
  linesCheck: function(){ //计算OBS版的最大行数
    console.log( `[默认聊天室行数] ${chat_limit}` );
    
    let cssCheck_kk_chat = document.querySelector('.kk_chat');

    if(cssCheck_kk_chat !== null){
      let cssCheck_one_line_height = cssCheck_kk_chat.scrollHeight;
      let cssCheck_screen_height = window.innerHeight;
      console.log( `[测试单行高度] ${cssCheck_one_line_height}` );
      console.log( `[测试画面高度] ${cssCheck_screen_height}` );

      let auto_chat_lines = ( cssCheck_screen_height/cssCheck_one_line_height ).toFixed(0);
      auto_chat_lines = auto_chat_lines*1.0 + 3; //加3行缓冲
      console.log( `[自动判定聊天室行数] ${auto_chat_lines}` );

      //若在安全范围内则修改,未在安全范围内则继续使用默认值
      if(auto_chat_lines>=10 && auto_chat_lines<=100){
        //全域变量
        chat_limit = auto_chat_lines;
        console.log( `[聊天室行数] ${chat_limit} (修改成功)` );
      }else{
        console.log( `[聊天室行数] ${chat_limit} (未在安全范围内则继续使用默认值)` );
      }
    }
  },
  htmlEncode: function (html_c) { //去除XSS字元
    html_c = html_c.toString();
    html_c = html_c.trim();
    return html_c.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
  writeToScreen: function (message, class_name_arr) { //将讯息写入画面的 div#output 里
    let pre = document.createElement("div");
    //pre.style.wordWrap = "break-word";
    pre.classList.add("output_lines");
    if (typeof class_name_arr !== "undefined") {
      pre.classList.add(...class_name_arr);
    } else {
      pre.classList.add("kk_chat");
    }

    message = message.trim();
    //pre.innerHTML = message.replace(/\n/g, "<br />"); // 将"\n"转换成"<br />"
    //pre.innerHTML = `<span class="kk_time">${this.get_time()}</span><span class="kk_border"></span>${message}`;
    pre.innerHTML = `<span class="kk_time kk_pod">${this.get_time()}</span>${message}`;

    output.appendChild(pre); //输出讯息在画面上

    this.scroll_to_bottom_auto();
    
    //新方法
    //选while而不用加一删一是因为要防bug漏算导致越积越多行
    //*目前不确定writeToScreen()如果送出太快太密集会不会导致行数多删
    while(output.childElementCount > chat_limit){
      output.removeChild(output.childNodes[0]); 
    }

    this.scroll_to_bottom_auto();

  },
  writeToScreen_v2: function (message, class_name_arr=["kk_chat"]) {
    let pre = document.createElement("div");
    //pre.style.wordWrap = "break-word";
    pre.classList.add("output_lines");
    pre.classList.add(...class_name_arr);

    message = message.trim();
    //pre.innerHTML = message.replace(/\n/g, "<br />"); // 将"\n"转换成"<br />"
    //pre.innerHTML = `<span class="kk_time">${this.get_time()}</span><span class="kk_border"></span>${message}`;
    
    //pre.innerHTML = `<span class="kk_time kk_pod">${this.get_time()}</span>${message}`;
    let ele_span_pod = document.createElement("span");
    ele_span_pod.classList.add("kk_time");
    ele_span_pod.classList.add("kk_pod");
    ele_span_pod.innerText = this.get_time();
    pre.appendChild(ele_span_pod);

    let ele_span_msg = document.createElement("span");
    ele_span_msg.innerHTML = this.get_time();
    pre.appendChild(ele_span_msg);

    output.appendChild(pre); //输出讯息在画面上

    this.scroll_to_bottom_auto();
    
    //新方法
    //选while而不用加一删一是因为要防bug漏算导致越积越多行
    //*目前不确定writeToScreen()如果送出太快太密集会不会导致行数多删
    while(output.childElementCount > chat_limit){
      output.removeChild(output.childNodes[0]); 
    }

    this.scroll_to_bottom_auto();
  },
  scroll_to_bottom_auto: function () { //画面自动卷动
    if (stop_scroll == false) {
      window.scrollTo(0, document.body.scrollHeight); //画面自动卷动
      if (obs_mode == false) {
        elemVisibility.hide(scroll_to_bottom_btn);
      }
    } else {
      //document.getElementById("scroll_to_bottom_btn").style.display = 'block';
    }
  },
  scroll_to_bottom_btn: function () { //向下卷动的按钮
    let scroll_to_bottom_btn = document.getElementById("scroll_to_bottom_btn");
    scroll_to_bottom_btn.addEventListener("mouseup", function () {
      window.scrollTo(0, document.body.scrollHeight);
      //document.getElementById("scroll_to_bottom_btn").style.display = 'none';
      elemVisibility.hide(scroll_to_bottom_btn);
      stop_scroll = false;
    });
  },
  pt: function (num) { //数字小于10时前面补0 (显示时间用,例 12:07)
    return (num < 10 ? "0" : "") + num;
  },
  get_time: function () { //取得目前时间
    let now_time = new Date();

    //let year = now_time.getFullYear();
    //let month = this.pt( now_time.getMonth() + 1 );
    //let day = this.pt( now_time.getDate() );
    let hours = this.pt(now_time.getHours());
    let minutes = this.pt(now_time.getMinutes());
    //let seconds = this.pt( now_time.getSeconds() );

    let txt_datetime = `${hours}:${minutes}`;

    return txt_datetime;
  },
  get_time_full: function () { //取得目前时间
    let now_time = new Date();

    let year = now_time.getFullYear();
    let month = this.pt( now_time.getMonth() + 1 );
    let day = this.pt( now_time.getDate() );
    let hours = this.pt(now_time.getHours());
    let minutes = this.pt(now_time.getMinutes());
    let seconds = this.pt( now_time.getSeconds() );

    let txt_datetime = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

    return txt_datetime;
  },
  numberWithCommas: function (x) { //数字千位加逗点 ( '1000' => '1,000' )
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  },
  display_datetime: function() {
    //
    setInterval(()=>{
      //let tool_bar_datetime = document.getElementById("tool_bar_datetime");
      tool_bar_datetime_span.textContent = `● ${this.get_time()}`;
    },1000);
  },
  check_scroll: function () { //检查画面卷动方向,如果向上则触法暂停卷动功能
    //原版
    if (obs_mode != true) {
      var lastScrollTop = 0;

      document.body.addEventListener('wheel', function() {
        stop_scroll = true;
        elemVisibility.show(scroll_to_bottom_btn);
      });

      document.body.addEventListener("touchmove", function() {
        stop_scroll = true;
        elemVisibility.show(scroll_to_bottom_btn);
      });
    }
  },
  ToHex: function (n)
  {	var h, l;

    n = Math.round(n);
    l = n % 16;
    h = Math.floor((n / 16)) % 16;
    return (hexch[h] + hexch[l]);
  }
  ,
  DoColor: function (c, l)
  { var r, g, b;

    r = '0x' + c.substring(1, 3);
    g = '0x' + c.substring(3, 5);
    b = '0x' + c.substring(5, 7);
    
    if(l > 120)
    {
      l = l - 120;

      r = (r * (120 - l) + 255 * l) / 120;
      g = (g * (120 - l) + 255 * l) / 120;
      b = (b * (120 - l) + 255 * l) / 120;
    }else
    {
      r = (r * l) / 120;
      g = (g * l) / 120;
      b = (b * l) / 120;
    }

    return '#' + this.ToHex(r) + this.ToHex(g) + this.ToHex(b);
  },
  pfid_color: function(_pfid){
    let rel_color = "#ff4c4c";
    if( _pfid && (typeof _pfid=="string" || typeof _pfid=="number") ){
      //let new_color = "#A" + pfid.toString().substr(0, 7);
      let new_color_dec = parseInt(_pfid) % 16777215;
      if(new_color_dec<=16777215 && new_color_dec >= 0){
        let new_color_hex = new_color_dec.toString(16);
        if(new_color_hex.length == 6){
          baseCol = "#" + new_color_hex;
          rel_color = this.DoColor(baseCol, "192")
        }
      }
    }

    return rel_color;
  }
};

//聊天室
var ws_chat = {
  onOpen: function (evt) {
    //DEBUG_MODE && console.log(evt);
    this.doSend(`CAP REQ :twitch.tv/tags twitch.tv/commands`);
    this.doSend(`NICK justinfan${Math.ceil(Math.random()*100000)}`);
    this.doSend(`JOIN #${window.location.hash.substr(1)}`);
    setInterval(() => {
      this.doSend("PING");
    }, 300000);
    
    main.writeToScreen(`[成功连接聊天室服务器]`, ["kk_chat", "kk_conn", "kk_reconn"]);
    reconnection_chat_count = 0;
  },
  onMessage: function (evt) {
    DEBUG_MODE && console.log(evt.data);

    let chat_string = evt.data.trim();

    if (chat_string.indexOf("PING") != -1) {
      this.doSend("PONG");
    }

    if (chat_string.indexOf("PRIVMSG") != -1) {
      // 管理员判断
      let mod = /mod=(.*?);/.exec(chat_string)[1];
      let role = "";
      if (mod == "1") {
        role = "管理";
      }
      if(role !== ""){
        role = `<span class="pod isadmin">${role}</span>`;
      }

      // 用户名颜色
      let pfid = /user-id=(.*?);/.exec(chat_string)[1];
      let rel_color = main.pfid_color(pfid);
      let color_css = rel_color ? ("color:" + rel_color + ";") : "";

      // 用户名
      let w_name = /display-name=(.*?);/.exec(chat_string)[1];

      // 弹幕内容
      let msg = /PRIVMSG.*:(.*)/.exec(chat_string)[1];
      
      // 表情
      let emotes = /emotes=(.*?);/.exec(chat_string)[1];

      if (emotes != '')
      {
        let emotes_list = emotes.split("/");
        let emotes_list_len = emotes_list.length;
        let token = [];
        for (var i = 0; i < emotes_list_len; i++) {
          let emote = emotes_list[i].split(":")
          let index = emote[1].split(",")
          let pos = index[0].split("-")
          token.push([msg.substring(parseInt(pos[0]),parseInt(pos[1])+1),emote[0]])
        }
        let token_len = token.length;
        for (var j = 0; j < token_len; j++) {
          let reg = eval(`/${token[j][0]}/g`);
          msg = msg.replace(reg, `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${token[j][1]}/default/dark/2.0" width="30px" height="30px" />`)
        }
      }

      main.writeToScreen(`${role}<span class="name name_title" style="${color_css}" title="${pfid}">${w_name} :</span> <span class="msg">${msg}</span>`, ["kk_chat"]);
    }
  },
  onError: function (evt) {
    main.writeToScreen('<span style="color: red;">[ERROR]:</span> ' + main.htmlEncode(evt.data));
  },
  doSend: function (message) {
    websocket.send(message);
  },
  onClose: function (evt) {
    main.writeToScreen(`[❎与聊天室服务器断开]`, ["kk_chat", "kk_conn", "kk_reconn"]);

    this.reConnection();
  },
  reConnection: function () {
    websocket.close();
    websocket = null;
    reconnection_chat_count++;
    if (reconnection_chat_count <= 25) {
      window.setTimeout(function () {
        main.writeToScreen(`[重新连接聊天室服务器..(${reconnection_chat_count})]`, ["kk_chat", "kk_conn", "kk_reconn"]);
        webSocket_chat();
      }, 15000);
    } else {
      main.writeToScreen(`[重新连接聊天室服务器..(连接失败)]`, ["kk_chat", "kk_conn", "kk_reconn"]);
    }
  },
};

//聊天室
function webSocket_chat() {
  websocket = new WebSocket(wsUri_chat);

  //websocket的事件监听器
  websocket.onopen = function (evt) { ws_chat.onOpen(evt) };
  websocket.onclose = function (evt) { ws_chat.onClose(evt) };
  websocket.onmessage = function (evt) { ws_chat.onMessage(evt) };
  websocket.onerror = function (evt) { ws_chat.onError(evt) };
}

(function () {
  //程序进入点
  window.addEventListener("load", main.init(), false);
})();
