# TitleVote Pro

设计一个职称评审推荐投票平台，分管理后台，与评委投票前台，管理后台由超级用户icelm@sina.com,密码：65928088Lit，登录后进行设置与管理，首先是管理员的管理，输入学校名称，输入姓名，生成该管理员的用户名与密码，并支持对该管理员的系统权限管理，每个高校可以有多个不同权限的管理员。管理员登录后，可以对显示界面进行二次配置，比如学校的名称，logo等信息，确保每个高校管理的登录界面都是本校个性化的显示，评委投票端的界面也是随管理员二次配置而同步，确保每个学校都是个性化。管理员登录后，导入评委名单，生成评委登录用户名与密码，设置评审类别与分组，总的评委会由评委会主任委员，副主任委员，其权限可以对排评委进行分组，任命组长或小组推选组长，工科组、 理科，文史等，评审类别：高级，中级，非教师系列等可以设置，学科小组也可以动态设置。管理员导入评审对象名单，自动按不同评审类别与学科进行分组。管理员还要设计投票规则，比如总人数30人，只能推荐11人，超过11人则不支持评委提交，并提醒评委存在什么问题。学科小组内有组长在登录评委界面后，发起小组投票，各个评委进行投票，可以选择，推荐，不推荐，弃权三个选项，在每个参评人员名字后面跟一个下拉框显示上述三个选项，评委选择后，提交前，进行二次确认，只有符合规则，才可以提交，并对个人与小组投票生成确认页，管理员端可以查看各学科小组、整个评审类别的投票情况，并提供数据可视化显示的图形界面，支持对于个人与小组，整个类别的投票结果，打印DOC，PDF格式带签名位置的确认单，打印让评委与小组全体人员签字确认。UI风格参考管理  评委端:  https://liz-grew-inns-properly.trycloudflare.com/     

  管理端:  https://liz-grew-inns-properly.trycloudflare.com/admin

✓ 管理员「test_admin」已创建，初始密码：JMnA5WuH（请立即复制保存，仅显示一次）
系统功能参考：河南省职称评审平台的功能。

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://title-vote.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2257c743-f11c-4292-a959-fe332a7f5c58).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
