"""Picture shapes for words: label (lower case) -> one emoji whose outline becomes the hole / the mascot's body.
Key may be "category:label" to override for one category.  The outlines come from Noto Emoji (monochrome, SIL OFL),
flattened to a solid silhouette (scripts/make_vocab.py).  Words that are not listed keep their Japanese text.
"""
E_RAW = """
cat 🐈|dog 🐕|elephant 🐘|gorilla 🦍|horse 🐎|monkey 🐒|panda 🐼|tiger 🐅|mouse 🐁|rabbit 🐇|snake 🐍|boar 🐗|wild boar 🐗
bear 🐻|lion 🦁|zebra 🦓|camel 🐫|giraffe 🦒|orangutan 🦧|koala 🐨|fox 🦊|crocodile 🐊|frog 🐸|bird 🐦|hippo 🦛|cow 🐄|pig 🐖
kangaroo 🦘|deer 🦌|goat 🐐|sheep 🐑|hamster 🐹|wolf 🐺|chicken 🐔|duck 🦆|hawk 🦅|snail 🐌|iguana 🦎|dinosaur 🦖|dragon 🐉|unicorn 🦄
bat 🦇|owl 🦉|swan 🦢|parrot 🦜|squirrel 🐿|hedgehog 🦔|rhino 🦏|ox 🐂|turkey 🦃|peacock 🦚|flamingo 🦩|kiwi 🥝
ear 👂|eye 👁|mouth 👄|nose 👃|arm 💪|hand ✋|leg 🦵|nail 💅|teeth 🦷|thumb 👍|tongue 👅|foot 🦶|brain 🧠|bone 🦴|heart 🫀
orange 🍊|carrot 🥕|cucumber 🥒|green pepper 🫑|green peppers 🫑|onion 🧅|onions 🧅|tomato 🍅|tomatoes 🍅|banana 🍌|bananas 🍌|peach 🍑|peaches 🍑
pineapple 🍍|strawberry 🍓|strawberries 🍓|mushroom 🍄|mushrooms 🍄|corn 🌽|potato 🥔|potatoes 🥔|cherry 🍒|cherries 🍒|apple 🍎|broccoli 🥦
cabbage 🥬|lettuce 🥬|eggplant 🍆|grapes 🍇|kiwi fruit 🥝|lemon 🍋|melon 🍈|melons 🍈|nut 🥜|watermelon 🍉|mango 🥭|olive 🫒|pear 🍐
pumpkin 🎃|bean 🫘|carrots 🥕|cucumbers 🥒|oranges 🍊|garlic 🧄|coconut 🥥|avocado 🥑|ginger 🫚|peas 🫛
soccer ⚽|baseball ⚾|basketball 🏀|badminton 🏸|tennis 🎾|volleyball 🏐|rugby 🏉|golf ⛳|skiing 🎿|swimming 🏊|skateboarding 🛹
table tennis 🏓|ice hockey 🏒|figure skating ⛸|fencing 🤺|judo 🥋|sailing ⛵|surfing 🏄|weight lifting 🏋|marathon 🏃|road cycling 🚴
wrestling 🤼|gymnastics 🤸|softball 🥎|cricket 🏏|dancing 💃|skating 🛼|wheelchair tennis ♿|dodgeball 🏐|boxing 🥊|bowling 🎳|archery 🏹|curling 🥌
sunny ☀|cloudy ☁|rainy ☔|snowy ❄|hot 🌡|cold 🧊|windy 💨|humid 💧|thunder ⚡|rain 🌧|rainbow 🌈
shirt 👔|pants 👖|jacket 🧥|boots 🥾|hat 🎩|cap 🧢|shorts 🩳|t-shirt 👕|socks 🧦|shoes 👟|vest 🦺|glasses 👓|ribbon 🎀|gloves 🧤|dress 👗|scarf 🧣|bikini 👙|kimono 👘
pencil ✏|ruler 📏|pen 🖊|ballpoint pen 🖋|notebook 📓|marker 🖍|brush 🖌|scissors ✂|pin 📌|pencil case 🎒
library 📚|school 🏫|playground 🛝|computer room 💻|science room 🔬|cooking room 🍳|arts and crafts room 🎨|music room 🎼|nurse's office 🩺
traffic light 🚦|stop 🛑
english 🔤|math ➗|science 🔬|music 🎵|arts and crafts 🎨|home economics 🍳|p.e. 🏃|social studies 🗺|calligraphy 🖌
artist 🎨|astronaut 🚀|baker 🥖|comedian 🎭|doctor 🩺|farmer 🌾|fire fighter 🚒|mountaineer ⛰|nurse 💉|office worker 💼|pilot ✈|police officer 👮
programmer 💻|researcher 🔬|scientist 🧪|singer 🎤|vet 🐾|writer ✍|zookeeper 🦁|dentist 🦷|florist 💐|game programmer 🎮|idol ⭐|king 👑
lawyer ⚖|musician 🎸|pharmacist 💊|reporter 📰|voice actor 🎙|cook 🍳|detective 🔍
town 🏘|house 🏠|park 🌳|museum 🏛|hospital 🏥|bus stop 🚏|station 🚉|police station 🚓|fire station 🚒|post office 📮|bookstore 📖|restaurant 🍽
supermarket 🛒|castle 🏯|shrine ⛩|temple 🛕|church ⛪|aquarium 🐠|stadium 🏟|zoo 🦁|amusement park 🎡|convenience store 🏪|elementary school 🏫
bus 🚌|taxi 🚕|bike 🚲|train 🚆|airplane ✈|airport 🛫|bank 🏦|boat 🛶|bridge 🌉|car 🚗|city 🏙|city hall 🏢|department store 🏬|factory 🏭
farm 🚜|flower shop 🌷|garden 🌻|gas station ⛽|hotel 🏨|ship 🚢|shop 🛍|subway 🚇|theater 🎭|tower 🗼|truck 🚚|van 🚐|yacht ⛵
rice 🍚|rice ball 🍙|curry and rice 🍛|bread 🍞|sandwich 🥪|pancake 🥞|pizza 🍕|hamburger 🍔|hot dog 🌭|french fries 🍟|fried chicken 🍗
steak 🥩|spaghetti 🍝|pie 🥧|salad 🥗|soup 🍲|ramen 🍜|sushi 🍣|tempura 🍤|cheese fondue 🫕|fried egg 🍳|miso soup 🥣|dumpling 🥟|taco 🌮|burrito 🌯
coffee ☕|tea 🫖|green tea 🍵|juice 🧃|soda 🥤|milk 🥛|mineral water 💧|cola 🥤|beer 🍺|wine 🍷
cake 🍰|candy 🍬|chocolate 🍫|cookie 🍪|donut 🍩|ice cream 🍦|parfait 🍨|popcorn 🍿|pudding 🍮|shaved ice 🍧|cupcake 🧁|lollipop 🍭
meat 🍖|bacon 🥓|cheese 🧀|egg 🥚|salmon 🐟|octopus 🐙|crab 🦀|shellfish 🐚|shrimp 🦐|squid 🦑|salt 🧂
piano 🎹|guitar 🎸|violin 🎻|drum 🥁|trumpet 🎺|saxophone 🎷|keyboard harmonica 🎹
bag 👜|umbrella ☂|mug ☕|textbook 📖|present 🎁|treasure 💎|ticket 🎫|watch ⌚|tv 📺|computer 💻|smartphone 📱|chair 🪑|bed 🛏|calendar 📅
basket 🧺|bath 🛁|book 📕|box 📦|bucket 🪣|camera 📷|clock 🕐|cup ☕|doll 🪆|door 🚪|fork 🍴|key 🔑|lamp 💡|map 🗺
ring 💍|sofa 🛋|spoon 🥄|telephone ☎|wall 🧱|wheelchair ♿|yen 💴|glove 🧤|dictionary 📚|comic book 💬|racket 🏸|balloon 🎈|bell 🔔|candle 🕯|toothbrush 🪥|soap 🧼
desert 🏜|forest 🌲|rain forest 🌴|mountain ⛰|sea 🌊|ocean 🌊|beach 🏖|cloud ☁|fire 🔥|flower 🌷|ice 🧊|island 🏝|plant 🌱|rock 🪨|rose 🌹|snow ⛄|space 🪐|sun ☀|tree 🌳|volcano 🌋|leaf 🍃
spring 🌸|summer 🌻|fall 🍂|winter ⛄
whale 🐋|dolphin 🐬|penguin 🐧|sea turtle 🐢|shark 🦈|jellyfish 🪼|fish 🐟|sea otter 🦦|seal 🦭
ant 🐜|beetle 🪲|bugs 🐛|butterfly 🦋|earthworm 🪱|grasshopper 🦗|ladybug 🐞|mosquito 🦟|spider 🕷|bee 🐝
run 🏃|walk 🚶|swim 🏊|sing 🎤|dance 💃|eat 🍽|drink 🥤|read 📖|write ✍|draw 🎨|ride 🚲|drive 🚗|wash 🧼|cut ✂|look 👀|listen 👂|speak 🗣|call 📞|buy 🛒
climb 🧗|sit 🪑|wait ⏳|play 🎮|work 💼|study 📚|travel 🧳|wear 👕|sleep 🛌|fly ✈|kick ⚽
camping ⛺|fishing 🎣|hiking 🥾|shopping 🛍|reading 📖|drawing 🖍|jogging 🏃|playing the piano 🎹|playing video games 🎮|seeing movies 🎬
watching a movie 🎬|running 🏃|playing the guitar 🎸|kite flying 🪁|rock-paper-scissors ✌
art club 🎨|badminton team 🏸|baseball team ⚾|basketball team 🏀|brass band 🎺|broadcasting club 📻|chorus 🎤|computer club 💻|cooking club 🍳|dance team 💃
drama club 🎭|gymnastics team 🤸|newspaper club 📰|photography club 📷|science club 🔬|soccer team ⚽|softball team 🥎|table tennis team 🏓
tennis team 🎾|track and field team 🏃|volleyball team 🏐
birthday 🎂|new year's day 🎍|doll's festival 🎎|cherry blossom viewing 🌸|children's day 🎏|star festival 🎋|halloween 🎃|christmas 🎄|new year's eve 🔔|snow festival ⛄
sports day 🏅|chorus contest 🎤|swimming meet 🏊|summer vacation 🏖|music festival 🎵|drama festival 🎭|school festival 🎪|graduation ceremony 🎓|evacuation drill 🚨|field trip 🚌|school trip 🚌
things:bat 🏏|japan 🗾|america 🗽|moon 🌙|earth 🌍
"""
# custom drawn shapes (private-use characters, built in scripts/make_vocab.py)
EMOJI_EXTRA = 'left \ue000|right \ue001|up \ue002|down \ue003|straight \ue002|turn \ue004|go \ue001'
# line-art pictures whose plain silhouette is only a circle / box: keep their dark details as holes in the shape
DETAIL_INK = set('⚽🏀⚾🏐🥎🐼🐻🐹👁🕐🍪🍩🥝🎾')
# boxed symbols whose picture is the white part
DETAIL_WHITE = set('♿💴🪟🖼🧱')
EMOJI = {}  # 'label' or 'category:label' -> emoji
for line in E_RAW.strip().splitlines():
    for part in line.split('|'):
        part = part.strip()
        if part:
            k, _, e = part.rpartition(' ')
            EMOJI[k] = e

for part in EMOJI_EXTRA.split('|'):
    k, _, e = part.rpartition(' ')
    EMOJI[k] = e
EMOJI['wheelchair'] = '♿'
