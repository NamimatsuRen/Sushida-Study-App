const make = rows => rows.trim().split('\n').map(row => {
  const [text, translation] = row.split('|');
  return { text, translation };
});
export const PHRASES = {
  easy: make(`
tea|お茶
rice|ごはん
sushi|寿司
salmon|サーモン
tuna|まぐろ
shrimp|えび
egg|たまご
water|水
lemon|レモン
apple|りんご
orange|オレンジ
coffee|コーヒー
bread|パン
sweet|甘い
fresh|新鮮な
happy|幸せな
smile|笑顔
hello|こんにちは
thanks|ありがとう
friend|友だち
family|家族
travel|旅行
summer|夏
winter|冬
spring|春
garden|庭
flower|花
forest|森
ocean|海
island|島
sunrise|日の出
rainbow|虹
music|音楽
rhythm|リズム
guitar|ギター
piano|ピアノ
little|小さな
bright|明るい
dream|夢
future|未来
wonder|驚き
learn|学ぶ
create|つくる
focus|集中する
relax|くつろぐ
peace|平和
planet|惑星
world|世界
curious|好奇心の強い
welcome|ようこそ`),
  normal: make(`
good morning|おはよう
thank you|ありがとう
see you soon|またすぐに会おう
take a break|ひと休みしよう
have a nice day|よい一日を
one more plate|もうひと皿
fresh salmon|新鮮なサーモン
green tea|緑茶
rice and fish|ごはんと魚
at your own pace|自分のペースで
never give up|あきらめないで
keep going|その調子で
little by little|少しずつ
practice daily|毎日練習しよう
stay curious|好奇心を忘れずに
follow your heart|心に従って
make it happen|実現しよう
try something new|新しいことを試そう
open the window|窓を開けて
a cup of coffee|コーヒーを一杯
under the stars|星空の下で
across the ocean|海を越えて
walk in the park|公園を散歩する
listen to music|音楽を聴く
read a good book|よい本を読む
enjoy the moment|今を楽しもう
a little magic|小さな魔法
the blue sky|青い空
sweet dreams|よい夢を
here we go|さあ始めよう
nice to meet you|はじめまして
welcome back|おかえりなさい
just in time|ちょうど間に合って
piece of cake|朝飯前
better together|一緒ならもっとよい
ready to go|出発の準備ができた
the next chapter|次の章へ
a new adventure|新しい冒険
good things ahead|いいことが待っている
believe in you|あなたを信じている`),
  hard: make(`
a journey of a thousand miles|千里の道
there is always another way|いつだって別の道がある
practice makes progress|練習は進歩につながる
the best is yet to come|最高の瞬間はこれから
small steps make a big difference|小さな一歩が大きな違いを生む
let your curiosity lead the way|好奇心に道案内を任せよう
there is no place like home|わが家に勝る場所はない
every day is a fresh start|毎日が新しいスタート
look at the bigger picture|もっと広い視野で見てみよう
good things take time|よいものには時間がかかる
make yourself at home|どうぞくつろいで
what a wonderful world|なんてすばらしい世界
keep your eyes on the stars|星を見つめ続けよう
today is a good day to begin|今日は始めるのによい日
one plate is never enough|ひと皿では足りない
would you like some green tea|お茶はいかがですか
this is my favorite sushi restaurant|ここはお気に入りの寿司屋です
can we have one more plate|もうひと皿お願いできますか
nothing beats a fresh cup of coffee|淹れたてのコーヒーは最高
let us try a different approach|別の方法を試してみよう
find joy in the little things|小さなことに喜びを見つけよう
take your time and enjoy the ride|焦らず旅を楽しもう
we are all learning something new|誰もが新しい何かを学んでいる
a little kindness goes a long way|小さな親切が大きな力になる
turn your dreams into reality|夢を現実にしよう
put your heart into everything you do|何事にも心を込めて
thank you for your patience|お待ちいただきありがとうございます
i am looking forward to the weekend|週末を楽しみにしている
the early bird catches the worm|早起きは三文の徳
it is a beautiful day outside|外はすばらしい天気だ
follow the path that feels right|自分が正しいと感じる道へ
remember to enjoy the little moments|小さな瞬間を楽しむことを忘れずに
we make a great team together|私たちはすばらしいチームだ
there is something good in every day|毎日に何かよいことがある
please pass the soy sauce|しょうゆを取ってください
this tastes even better than it looks|見た目以上においしい
all you need is a little practice|必要なのは少しの練習
there is more than meets the eye|見た目だけではわからない
life is full of little surprises|人生は小さな驚きでいっぱい
let us make the most of today|今日を最大限に楽しもう`),
};
